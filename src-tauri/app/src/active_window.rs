use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowInfo {
  pub process_name: String,
  pub window_title: String,
  /// True when OS APIs produced a foreground snapshot (Windows); false on other OS.
  pub available: bool,
}

#[cfg(target_os = "windows")]
fn snapshot_windows() -> ActiveWindowInfo {
  use windows_sys::Win32::Foundation::{CloseHandle, HWND};
  use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_NAME_WIN32,
  };
  use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};

  let hwnd: HWND = unsafe { GetForegroundWindow() };
  if hwnd.is_null() {
    return ActiveWindowInfo {
      process_name: String::new(),
      window_title: String::new(),
      available: true,
    };
  }

  let mut title_buf = [0u16; 1024];
  let title_len = unsafe { GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32) } as usize;
  let window_title = if title_len > 0 {
    String::from_utf16_lossy(&title_buf[..title_len])
  } else {
    String::new()
  };

  let mut pid = 0u32;
  unsafe {
    GetWindowThreadProcessId(hwnd, &mut pid);
  }
  if pid == 0 {
    return ActiveWindowInfo {
      process_name: String::new(),
      window_title,
      available: true,
    };
  }

  let process_name = unsafe {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if handle.is_null() {
      String::new()
    } else {
      let mut path_buf = vec![0u16; 1024];
      let mut size = path_buf.len() as u32;
      let ok = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_WIN32,
        path_buf.as_mut_ptr(),
        &mut size,
      );
      let _ = CloseHandle(handle);
      if ok != 0 && size > 0 {
        let path = String::from_utf16_lossy(&path_buf[..size as usize]);
        path
          .rsplit('\\')
          .next()
          .unwrap_or(&path)
          .to_string()
      } else {
        String::new()
      }
    }
  };

  ActiveWindowInfo {
    process_name,
    window_title,
    available: true,
  }
}

#[cfg(target_os = "macos")]
fn snapshot_macos() -> ActiveWindowInfo {
  // AppKit APIs are not thread-safe; ensure we call them on the main thread.
  // This avoids intermittent crashes when invoked from background threads.
  snapshot_macos_on_main_thread()
}

#[cfg(target_os = "macos")]
fn snapshot_macos_on_main_thread() -> ActiveWindowInfo {
  use dispatch2::run_on_main;
  use objc2::msg_send;
  use objc2_app_kit::NSWorkspace;

  // `run_on_main` runs the closure on the main thread synchronously (passing through if
  // we're already on it). AppKit APIs like NSWorkspace are not thread-safe, so we keep
  // the critical section small and purely reads of foreground state.
  run_on_main(|_mtm| {
    let frontmost = unsafe {
      let ws = NSWorkspace::sharedWorkspace();
      ws.frontmostApplication()
    };

    let Some(app) = frontmost else {
      return ActiveWindowInfo {
        process_name: String::new(),
        window_title: String::new(),
        available: true,
      };
    };

    let process_name = unsafe {
      app
        .localizedName()
        .map(|s| s.to_string())
        .or_else(|| app.bundleIdentifier().map(|s| s.to_string()))
        .unwrap_or_default()
    };

    // Window titles on macOS require Accessibility permission. If not granted, we still
    // return the foreground app so tracking can proceed.
    let window_title = if macos_accessibility_trusted(false) {
      let pid: i32 = unsafe { msg_send![&*app, processIdentifier] };
      macos_focused_window_title(pid)
    } else {
      String::new()
    };

    ActiveWindowInfo {
      process_name,
      window_title,
      available: true,
    }
  })
}

#[cfg(target_os = "macos")]
fn macos_accessibility_trusted(prompt: bool) -> bool {
  use core_foundation::base::TCFType;
  use core_foundation::dictionary::CFDictionary;
  use core_foundation::string::CFString;
  use core_foundation_sys::base::Boolean;
  use core_foundation_sys::dictionary::CFDictionaryRef;

  #[link(name = "ApplicationServices", kind = "framework")]
  extern "C" {
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> Boolean;
  }

  // If we don't want to prompt, prefer the simple check.
  if !prompt {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
      fn AXIsProcessTrusted() -> Boolean;
    }
    unsafe { AXIsProcessTrusted() != 0 }
  } else {
    // Avoid linking against the global symbol; use the documented key string instead.
    let key = CFString::new("AXTrustedCheckOptionPrompt");
    let val = if prompt { core_foundation::boolean::CFBoolean::true_value() } else { core_foundation::boolean::CFBoolean::false_value() };
    let opts = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), val.as_CFType())]);
    unsafe { AXIsProcessTrustedWithOptions(opts.as_concrete_TypeRef()) != 0 }
  }
}

#[cfg(target_os = "macos")]
pub fn ensure_accessibility(prompt: bool) -> bool {
  macos_accessibility_trusted(prompt)
}

#[cfg(not(target_os = "macos"))]
pub fn ensure_accessibility(_prompt: bool) -> bool {
  true
}

#[cfg(target_os = "macos")]
fn macos_focused_window_title(pid: i32) -> String {
  use core_foundation::base::TCFType;
  use core_foundation::string::CFString;
  use core_foundation_sys::base::{CFRelease, CFTypeRef};
  use core_foundation_sys::string::CFStringRef;

  type AXUIElementRef = *const std::ffi::c_void;
  type AXError = i32;

  #[link(name = "ApplicationServices", kind = "framework")]
  extern "C" {
    fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
      element: AXUIElementRef,
      attribute: CFStringRef,
      value: *mut CFTypeRef,
    ) -> AXError;
  }

  unsafe {
    // Avoid linking against kAX* global symbols; use documented attribute strings instead.
    let focused_attr = CFString::new("AXFocusedWindow");
    let title_attr = CFString::new("AXTitle");

    let app_el = AXUIElementCreateApplication(pid);
    if app_el.is_null() {
      return String::new();
    }

    let mut focused: CFTypeRef = std::ptr::null_mut();
    let err = AXUIElementCopyAttributeValue(app_el, focused_attr.as_concrete_TypeRef(), &mut focused);
    if err != 0 || focused.is_null() {
      CFRelease(app_el as *const _);
      return String::new();
    }
    let focused_el = focused as AXUIElementRef;

    let mut title_val: CFTypeRef = std::ptr::null_mut();
    let err2 = AXUIElementCopyAttributeValue(focused_el, title_attr.as_concrete_TypeRef(), &mut title_val);

    // Release focused window element now that we're done with it.
    CFRelease(focused as *const _);
    // Release the application AX element as well.
    CFRelease(app_el as *const _);

    if err2 != 0 || title_val.is_null() {
      return String::new();
    }

    let title_cf: CFStringRef = title_val as CFStringRef;
    let title = CFString::wrap_under_create_rule(title_cf).to_string();
    // Release the CFString we received (wrap_under_create_rule assumes create-rule).
    // CFString::wrap_under_create_rule will take ownership; do not CFRelease(title_val) again.
    title
  }
}

#[cfg(target_os = "windows")]
pub fn snapshot() -> ActiveWindowInfo {
  snapshot_windows()
}

#[cfg(target_os = "macos")]
pub fn snapshot() -> ActiveWindowInfo {
  snapshot_macos()
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn snapshot() -> ActiveWindowInfo {
  ActiveWindowInfo { process_name: String::new(), window_title: String::new(), available: false }
}
