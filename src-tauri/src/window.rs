use tauri::{Theme, Window};

#[cfg(test)]
use std::sync::{Mutex, OnceLock};

#[cfg(test)]
type WindowAppearanceOverride =
    Box<dyn Fn(&Window, &str) -> Result<(), String> + Send + Sync + 'static>;

#[cfg(test)]
static WINDOW_APPEARANCE_OVERRIDE: OnceLock<Mutex<Option<WindowAppearanceOverride>>> =
    OnceLock::new();

#[cfg(test)]
pub(crate) fn set_window_appearance_override(handler: Option<WindowAppearanceOverride>) {
    let slot = WINDOW_APPEARANCE_OVERRIDE.get_or_init(|| Mutex::new(None));
    *slot.lock().unwrap() = handler;
}

#[cfg(target_os = "macos")]
fn apply_macos_window_appearance(window: &Window, theme: &str) -> Result<(), String> {
    use objc2_app_kit::{
        NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua,
        NSAppearanceNameDarkAqua, NSWindow,
    };

    let ns_window = window
        .ns_window()
        .map_err(|error| error.to_string())?;
    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };

    if theme == "system" {
        ns_window.setAppearance(None);
        return Ok(());
    }

    let appearance_name = unsafe {
        if theme == "dark" {
            NSAppearanceNameDarkAqua
        } else {
            NSAppearanceNameAqua
        }
    };
    let appearance =
        NSAppearance::appearanceNamed(appearance_name).ok_or("NSAppearance missing")?;
    ns_window.setAppearance(Some(&appearance));
    Ok(())
}

pub(crate) fn apply_window_appearance(window: &Window, theme: &str) -> Result<(), String> {
    #[cfg(test)]
    if let Some(handler) = WINDOW_APPEARANCE_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap()
        .as_ref()
    {
        return handler(window, theme);
    }

    let next_theme = match theme {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    };
    let _ = window.set_theme(next_theme);

    #[cfg(target_os = "macos")]
    {
        let window_handle = window.clone();
        let theme_value = theme.to_string();
        window
            .run_on_main_thread(move || {
                let _ = apply_macos_window_appearance(&window_handle, theme_value.as_str());
            })
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}
