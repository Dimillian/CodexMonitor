#[cfg(desktop)]
use tauri::Theme;
use tauri::Window;

#[cfg(test)]
use std::sync::{Mutex, OnceLock};

#[cfg(test)]
type WindowAppearanceOverride =
    Box<dyn Fn(&Window, &str) -> Result<(), String> + Send + Sync + 'static>;

#[cfg(test)]
static WINDOW_APPEARANCE_OVERRIDE: OnceLock<Mutex<Option<WindowAppearanceOverride>>> =
    OnceLock::new();

#[cfg(target_os = "macos")]
fn apply_macos_window_appearance(window: &Window, theme: &str) -> Result<(), String> {
    use objc2_app_kit::{
        NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
        NSWindow,
    };

    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };

    if theme == "system" {
        ns_window.setAppearance(None);
        return Ok(());
    }

    let appearance_name = unsafe {
        if theme == "light" {
            NSAppearanceNameAqua
        } else {
            NSAppearanceNameDarkAqua
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

    #[cfg(desktop)]
    {
        let next_theme = match theme {
            "light" => Some(Theme::Light),
            "dark" | "dim" => Some(Theme::Dark),
            _ => None,
        };
        let _ = window.set_theme(next_theme);
    }

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

#[cfg(target_os = "ios")]
pub(crate) fn configure_ios_webview_edge_to_edge(
    webview_window: &tauri::WebviewWindow,
) -> Result<(), String> {
    use objc2::runtime::AnyObject;

    webview_window
        .with_webview(|webview| unsafe {
            let wk_webview = webview.inner().cast::<AnyObject>();
            if !wk_webview.is_null() {
                let scroll_view: *mut AnyObject = objc2::msg_send![wk_webview, scrollView];
                if !scroll_view.is_null() {
                    // UIScrollViewContentInsetAdjustmentNever
                    let adjustment_never: isize = 2;
                    let () = objc2::msg_send![
                        scroll_view,
                        setContentInsetAdjustmentBehavior: adjustment_never
                    ];
                    let () = objc2::msg_send![
                        scroll_view,
                        setAutomaticallyAdjustsScrollIndicatorInsets: false
                    ];
                }
            }

            let view_controller = webview.view_controller().cast::<AnyObject>();
            if !view_controller.is_null() {
                // UIRectEdgeAll
                let all_edges: usize = 15;
                let () = objc2::msg_send![view_controller, setEdgesForExtendedLayout: all_edges];
                let () = objc2::msg_send![
                    view_controller,
                    setExtendedLayoutIncludesOpaqueBars: true
                ];
            }
        })
        .map_err(|error| error.to_string())
}
