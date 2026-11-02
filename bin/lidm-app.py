#!/usr/bin/env python3
"""
LIDM Standalone Native Desktop Window
Uses GTK3 and WebKit2 to render the LIDM interface as a true native desktop application.
Independent of Chrome, Brave, Firefox, or any system browser.
"""

import sys
import os
import signal
import gi

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GdkPixbuf, GLib

class LidmWindow(Gtk.Window):
    def __init__(self, url="http://localhost:3030"):
        super().__init__(title="Internet Download Manager (LIDM)")

        # Window identity
        GLib.set_prgname("lidm")
        GLib.set_application_name("Internet Download Manager (LIDM)")
        self.set_wmclass("lidm", "lidm")
        self.set_role("lidm-main-window")

        # Size & position
        self.set_default_size(1180, 720)
        self.set_position(Gtk.WindowPosition.CENTER)

        # Set Icon
        script_dir = os.path.dirname(os.path.abspath(__file__))
        icon_path = os.path.join(os.path.dirname(script_dir), "public", "lidm.svg")
        if os.path.exists(icon_path):
            try:
                pixbuf = GdkPixbuf.Pixbuf.new_from_file(icon_path)
                self.set_icon(pixbuf)
                Gtk.Window.set_default_icon(pixbuf)
            except Exception:
                pass

        # WebKit Settings
        settings = WebKit2.Settings()
        settings.set_enable_javascript(True)
        settings.set_enable_developer_extras(True)
        settings.set_enable_webgl(True)
        settings.set_enable_page_cache(False)
        settings.set_allow_file_access_from_file_urls(True)
        settings.set_user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) LIDM/1.0 Safari/537.36")

        # User Content Manager
        content_mgr = WebKit2.UserContentManager()

        # WebView
        self.webview = WebKit2.WebView.new_with_user_content_manager(content_mgr)
        self.webview.set_settings(settings)
        self.webview.connect("decide-policy", self.on_decide_policy)

        # Key bindings (F5, Ctrl+R to reload)
        self.connect("key-press-event", self.on_key_press)

        # Container
        self.add(self.webview)
        self.webview.load_uri(url)

        # Clean shutdown on close
        self.connect("destroy", Gtk.main_quit)

    def on_key_press(self, widget, event):
        from gi.repository import Gdk
        # F5 or Ctrl+R / Ctrl+Shift+R to reload
        if event.keyval == Gdk.KEY_F5:
            self.webview.reload_bypass_cache()
            return True
        if (event.state & Gdk.ModifierType.CONTROL_MASK) and event.keyval in (Gdk.KEY_r, Gdk.KEY_R):
            self.webview.reload_bypass_cache()
            return True
        return False

    def on_decide_policy(self, webview, decision, decision_type):
        """Keep LIDM operations internal; route external web links to system browser."""
        if decision_type == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
            nav_action = decision.get_navigation_action()
            uri = nav_action.get_request().get_uri()
            if not uri.startswith("http://localhost:3030") and not uri.startswith("http://127.0.0.1:3030") and not uri.startswith("data:"):
                decision.ignore()
                os.system(f'xdg-open "{uri}" >/dev/null 2>&1 &')
                return True
        return False

def main():
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3030"
    app = LidmWindow(url)
    app.show_all()
    Gtk.main()

if __name__ == "__main__":
    main()
