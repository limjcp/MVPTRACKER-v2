use serde::{Deserialize, Serialize};

pub mod paths;
pub mod sqlite;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Health {
  pub ok: bool,
}

