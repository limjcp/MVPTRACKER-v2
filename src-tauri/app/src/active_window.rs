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

#[cfg(target_os = "windows")]
pub fn snapshot() -> ActiveWindowInfo {
  snapshot_windows()
}

#[cfg(not(target_os = "windows"))]
pub fn snapshot() -> ActiveWindowInfo {
  ActiveWindowInfo {
    process_name: String::new(),
    window_title: String::new(),
    available: false,
  }
}
