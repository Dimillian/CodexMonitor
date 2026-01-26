use std::collections::HashMap;

use crate::types::{WorkspaceEntry, WorkspaceInfo, WorkspaceSettings};

pub(crate) fn sort_workspaces(list: &mut Vec<WorkspaceInfo>) {
    list.sort_by(|a, b| {
        let a_order = a.settings.sort_order.unwrap_or(u32::MAX);
        let b_order = b.settings.sort_order.unwrap_or(u32::MAX);
        a_order
            .cmp(&b_order)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });
}

pub(crate) fn apply_workspace_settings_update(
    workspaces: &mut HashMap<String, WorkspaceEntry>,
    id: &str,
    settings: WorkspaceSettings,
) -> Result<WorkspaceEntry, String> {
    match workspaces.get_mut(id) {
        Some(entry) => {
            entry.settings = settings.clone();
            Ok(entry.clone())
        }
        None => Err("workspace not found".to_string()),
    }
}
