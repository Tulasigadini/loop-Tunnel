import customtkinter as ctk
import tkinter as tk
from tkinter import ttk, messagebox
import PIL.ImageTk
import PIL.Image
from PIL import Image, ImageTk
import webbrowser
import threading
import time
import os
import sys
from pathlib import Path
from typing import Optional, List

# Ensure project root is in sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from app.config import ConfigManager
from app.tunnel_engine import TunnelEngine
from app.inspector import RequestLog
from app.qr_generator import generate_image_qr
from app.updater import AppUpdater, APP_VERSION
from app.access_control import AccessControlManager, AccessStatus

# Set global appearance mode to Light Mode (matching User Reference Images)
ctk.set_appearance_mode("Light")
ctk.set_default_color_theme("blue")


def get_resource_path(relative_path: str) -> str:
    """Gets absolute path to resource, works for dev and PyInstaller frozen executable."""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", relative_path))


class SharePortGUI(ctk.CTk):
    def __init__(self, config_manager: ConfigManager):
        super().__init__()

        self.config_manager = config_manager
        self.engine: Optional[TunnelEngine] = None
        self.logs_data: List[RequestLog] = []
        self.latest_update_info = None

        # Initialize Auto-Updater Engine
        update_url = self.config_manager.get("update_url")
        self.updater = AppUpdater(current_version=APP_VERSION, update_url=update_url)

        # Window setup
        self.title("Share Port - Zero-Config Full-Stack Localhost Tunneling")
        self.geometry("1020x760")
        self.minsize(960, 700)
        self.configure(fg_color="#F4F7FC")

        # Set window icon
        icon_path = get_resource_path("app_icon.ico")
        if os.path.exists(icon_path):
            try:
                self.iconbitmap(icon_path)
            except Exception:
                pass

        # Build UI layout
        self._build_header()
        self._build_main_layout()
        self._load_saved_port_defaults()

        # Bind close event
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # Silently check for updates in background
        if self.config_manager.get("enable_auto_update_check", True):
            self.updater.check_for_updates_async(
                on_update_available=self._on_update_found
            )

        # Check remote access control policy asynchronously
        threading.Thread(target=self._check_access_policy, daemon=True).start()

    def _build_header(self):
        """Header banner with logo, title, status badge, and help button."""
        self.header_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=0, height=68, border_color="#E2E8F0", border_width=1)
        self.header_frame.pack(fill="x", side="top")
        self.header_frame.pack_propagate(False)

        # Left Container: Logo + Title + Subtitle
        left_header = ctk.CTkFrame(self.header_frame, fg_color="transparent")
        left_header.pack(side="left", padx=20, pady=12)

        icon_path = get_resource_path("app_icon.ico")
        if os.path.exists(icon_path):
            try:
                pil_logo = Image.open(icon_path).convert("RGBA")
                self.app_logo_img = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(38, 38))
                title_label = ctk.CTkLabel(
                    left_header,
                    text=" Share Port",
                    image=self.app_logo_img,
                    compound="left",
                    font=ctk.CTkFont(family="Plus Jakarta Sans", size=22, weight="bold"),
                    text_color="#0F172A"
                )
            except Exception as e:
                title_label = ctk.CTkLabel(
                    left_header,
                    text="Share Port",
                    font=ctk.CTkFont(family="Plus Jakarta Sans", size=22, weight="bold"),
                    text_color="#0F172A"
                )
        else:
            title_label = ctk.CTkLabel(
                left_header,
                text="Share Port",
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=22, weight="bold"),
                text_color="#0F172A"
            )
        title_label.pack(side="left", padx=(0, 12))

        subtitle_label = ctk.CTkLabel(
            left_header,
            text="Zero-Config Full-Stack Localhost Tunneling",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#64748B"
        )
        subtitle_label.pack(side="left", pady=(4, 0))

        # Right Container: Status Badge + Help Button
        right_header = ctk.CTkFrame(self.header_frame, fg_color="transparent")
        right_header.pack(side="right", padx=20, pady=14)

        # Connection Status Badge
        self.status_badge = ctk.CTkLabel(
            right_header,
            text="● Disconnected",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#991B1B",
            fg_color="#FEE2E2",
            corner_radius=20,
            padx=14,
            pady=5
        )
        self.status_badge.pack(side="right", padx=(10, 0))

        # Help Button
        self.help_btn = ctk.CTkButton(
            right_header,
            text="❓ Help",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            fg_color="#FFFFFF",
            hover_color="#F8FAFC",
            text_color="#334155",
            border_color="#CBD5E1",
            border_width=1,
            corner_radius=20,
            height=32,
            width=85,
            command=lambda: webbrowser.open("https://www.shareport.in")
        )
        self.help_btn.pack(side="right", padx=5)

        # Update Notification Badge (hidden by default)
        self.update_btn = ctk.CTkButton(
            right_header,
            text="🔔 Update Available",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            fg_color="#FEF3C7",
            hover_color="#FDE68A",
            text_color="#92400E",
            border_color="#FCD34D",
            border_width=1,
            corner_radius=20,
            height=32,
            command=self._open_update_dialog
        )

    def _on_update_found(self, update_info: dict):
        """Called when a new version is detected remotely."""
        self.latest_update_info = update_info
        remote_ver = update_info.get("version", "")
        self.after(0, lambda: self._show_update_badge(remote_ver))

    def _show_update_badge(self, remote_ver: str):
        if hasattr(self, 'update_btn'):
            self.update_btn.configure(text=f"🔔 Update Available (v{remote_ver})")
            self.update_btn.pack(side="right", padx=5)

    def _open_update_dialog(self):
        """Opens clean update modal dialog."""
        if not self.latest_update_info:
            return

        remote_ver = self.latest_update_info.get("version", "Latest")
        changelog = self.latest_update_info.get("changelog", "Bug fixes & performance improvements.")
        download_url = self.latest_update_info.get("download_url", "")

        dialog = ctk.CTkToplevel(self)
        dialog.title("Share Port Software Update")
        dialog.geometry("460x340")
        dialog.resizable(False, False)
        dialog.configure(fg_color="#FFFFFF")
        dialog.grab_set()

        ctk.CTkLabel(
            dialog,
            text=f"🚀 Share Port v{remote_ver} Available!",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A"
        ).pack(pady=(20, 5))

        ctk.CTkLabel(
            dialog,
            text=f"Current Version: v{APP_VERSION}  ➔  New Version: v{remote_ver}",
            font=ctk.CTkFont(size=12),
            text_color="#64748B"
        ).pack(pady=2)

        # Changelog box
        changelog_frame = ctk.CTkFrame(dialog, fg_color="#F8FAFC", border_color="#E2E8F0", border_width=1, corner_radius=10)
        changelog_frame.pack(fill="both", expand=True, padx=20, pady=15)

        ctk.CTkLabel(
            changelog_frame,
            text="What's New:",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#0F172A",
            anchor="w"
        ).pack(anchor="w", padx=12, pady=(8, 2))

        lbl = ctk.CTkLabel(
            changelog_frame,
            text=changelog,
            font=ctk.CTkFont(size=11),
            text_color="#334155",
            justify="left",
            wraplength=380
        )
        lbl.pack(anchor="w", padx=12, pady=(0, 8))

        # Download progress bar
        progress_bar = ctk.CTkProgressBar(dialog, width=380, progress_color="#4C8DFF", fg_color="#E2E8F0")
        progress_bar.set(0)

        status_lbl = ctk.CTkLabel(dialog, text="", font=ctk.CTkFont(size=11), text_color="#2563EB")

        def start_download():
            btn_update.configure(state="disabled", text="⏳ Downloading...")
            progress_bar.pack(pady=(0, 5))
            status_lbl.pack(pady=(0, 10))

            def on_progress(pct, dl_mb, tot_mb):
                def _update_ui():
                    progress_bar.set(pct)
                    if pct >= 1.0:
                        status_lbl.configure(text=f"Download complete! (100%) — Verifying...", text_color="#16A34A")
                    elif tot_mb > 0:
                        status_lbl.configure(text=f"Downloading update... {int(pct*100)}% ({dl_mb:.1f} MB / {tot_mb:.1f} MB)", text_color="#2563EB")
                    else:
                        status_lbl.configure(text=f"Downloading update... ({dl_mb:.1f} MB)", text_color="#2563EB")
                self.after(0, _update_ui)

            def do_restart():
                btn_update.configure(state="disabled", text="Restarting...")
                status_lbl.configure(text="Closing app and launching new version...", text_color="#16A34A")
                self.after(200, self.updater.apply_pending_update)

            def on_complete(success, msg):
                def _ui_done():
                    if success:
                        status_lbl.configure(text=msg, text_color="#16A34A")
                        btn_update.configure(
                            state="normal",
                            text="🚀 Restart & Apply",
                            fg_color="#16A34A",
                            hover_color="#15803D",
                            command=do_restart
                        )
                    else:
                        status_lbl.configure(text=msg, text_color="#DC2626")
                        btn_update.configure(state="normal", text="Retry Update", command=start_download)
                self.after(0, _ui_done)

            expected_hash = self.latest_update_info.get("sha256")
            self.updater.download_and_install_async(download_url, on_progress, on_complete, expected_sha256=expected_hash)

        btn_frame = ctk.CTkFrame(dialog, fg_color="transparent")
        btn_frame.pack(fill="x", padx=20, pady=(0, 20))

        btn_cancel = ctk.CTkButton(
            btn_frame,
            text="Later",
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#475569",
            command=dialog.destroy,
            width=100
        )
        btn_cancel.pack(side="left")

        btn_update = ctk.CTkButton(
            btn_frame,
            text="Update & Restart App",
            fg_color="#4C8DFF",
            hover_color="#3B7EFA",
            text_color="#FFFFFF",
            command=start_download
        )
        btn_update.pack(side="right")

    def _build_main_layout(self):
        """Split screen into Tunnel Settings on left, Share Your App / Inspector on right."""
        self.body_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.body_frame.pack(fill="both", expand=True, padx=16, pady=16)
        self.main_container = self.body_frame

        # Left Column (Tunnel Settings Panel)
        self.left_col = ctk.CTkScrollableFrame(self.body_frame, width=440, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=16)
        self.left_col.pack(side="left", fill="both", expand=False, padx=(0, 12))

        self._build_control_panel(self.left_col)

        # Right Column (Share Your App + Inspector Tabs)
        self.right_col = ctk.CTkFrame(self.body_frame, fg_color="transparent")
        self.right_col.pack(side="right", fill="both", expand=True)

        self._build_url_card(self.right_col)
        self._build_tabview(self.right_col)

    def _check_access_policy(self):
        """Asynchronously checks remote access control policy."""
        status = AccessControlManager.check_access(APP_VERSION, self.config_manager)
        if status.is_restricted:
            self.after(0, lambda: self._show_access_restricted_overlay(status))

    def _show_access_restricted_overlay(self, status: AccessStatus):
        """Renders full lock overlay screen blocking tunnel controls until acknowledged."""
        if hasattr(self, "overlay_frame") and self.overlay_frame.winfo_exists():
            return

        self.overlay_frame = ctk.CTkFrame(self.main_container, fg_color="rgba(244, 247, 252, 0.95)", corner_radius=16)
        self.overlay_frame.place(relx=0.5, rely=0.5, anchor="center", relwidth=0.98, relheight=0.98)

        card = ctk.CTkFrame(self.overlay_frame, fg_color="#FFFFFF", corner_radius=16, border_color="#CBD5E1", border_width=1)
        card.pack(expand=True, padx=40, pady=40, fill="both")

        ctk.CTkLabel(
            card,
            text=status.title or "📢 Important Notice",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=22, weight="bold"),
            text_color="#0F172A"
        ).pack(pady=(40, 15))

        msg_lbl = ctk.CTkLabel(
            card,
            text=status.message or "Access to the GUI is currently restricted.",
            font=ctk.CTkFont(size=14),
            text_color="#475569",
            justify="center",
            wraplength=520
        )
        msg_lbl.pack(padx=30, pady=(0, 25))

        def on_action_clicked():
            if status.action_type == "ok":
                if status.notice_id:
                    ack_list = self.config_manager.get("acknowledged_notices", [])
                    if status.notice_id not in ack_list:
                        ack_list.append(status.notice_id)
                        self.config_manager.set("acknowledged_notices", ack_list)
                self.overlay_frame.destroy()
            elif status.action_type == "update":
                if self.latest_update_info:
                    self._open_update_dialog()
                else:
                    webbrowser.open(status.action_url or "https://www.shareport.in")
            elif status.action_type == "url":
                if status.action_url:
                    webbrowser.open(status.action_url)
            else:
                self.overlay_frame.destroy()

        btn_text = status.action_button_text or ("👍 OK, Continue" if status.action_type == "ok" else "Action Required")
        action_btn = ctk.CTkButton(
            card,
            text=btn_text,
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=15, weight="bold"),
            fg_color="#4C8DFF",
            hover_color="#3B7EFA",
            text_color="#FFFFFF",
            height=44,
            width=220,
            corner_radius=12,
            command=on_action_clicked
        )
        action_btn.pack(pady=(10, 30))

    def _build_control_panel(self, parent):
        """Controls section for ports, subdomain mode, and engine (matching Image 1)."""
        self.ENGINE_MAP = {
            "Auto High-Speed": "cloudflare",
            "Fast Direct": "localhost_run",
            "Secure Line": "serveo"
        }
        self.ENGINE_REVERSE = {v: k for k, v in self.ENGINE_MAP.items()}

        # Header Title with Circle Badge Icon
        header_box = ctk.CTkFrame(parent, fg_color="transparent")
        header_box.pack(fill="x", padx=16, pady=(16, 12))

        icon_badge = ctk.CTkLabel(
            header_box,
            text="⚙️",
            font=ctk.CTkFont(size=18),
            fg_color="#EBF3FE",
            width=42,
            height=42,
            corner_radius=21
        )
        icon_badge.pack(side="left", padx=(0, 12))

        title_box = ctk.CTkFrame(header_box, fg_color="transparent")
        title_box.pack(side="left", fill="both", expand=True)

        ctk.CTkLabel(
            title_box,
            text="Tunnel Settings",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A",
            anchor="w"
        ).pack(anchor="w")

        ctk.CTkLabel(
            title_box,
            text="Configure your local server and create a secure tunnel.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            text_color="#64748B",
            anchor="w"
        ).pack(anchor="w", pady=(2, 0))

        # Target Mode Selector
        ctk.CTkLabel(
            parent,
            text="Target Mode",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", padx=16, pady=(10, 4))

        self.target_mode_var = ctk.StringVar(value="Full-Stack (One URL for both)")
        self.target_mode_selector = ctk.CTkOptionMenu(
            parent,
            values=["Full-Stack (One URL for both)", "Frontend Only", "Backend Only"],
            variable=self.target_mode_var,
            command=self._on_target_mode_changed,
            fg_color="#FFFFFF",
            button_color="#E2E8F0",
            button_hover_color="#CBD5E1",
            text_color="#0F172A",
            dropdown_fg_color="#FFFFFF",
            dropdown_text_color="#0F172A",
            dropdown_hover_color="#E0F2FE",
            corner_radius=10,
            height=38
        )
        self.target_mode_selector.pack(fill="x", padx=16, pady=(0, 8))

        # Container for Port Inputs
        self.ports_container = ctk.CTkFrame(parent, fg_color="transparent")
        self.ports_container.pack(fill="x", padx=16, pady=2)

        self.FE_PORT_OPTIONS = ["3000", "5173", "5000", "8000", "8080", "4000", "9000", "Custom..."]
        self.BE_PORT_OPTIONS = ["8000", "5000", "8080", "4000", "3000", "5173", "9000", "Custom..."]

        # Dual Column Ports Frame (matching Image 1)
        self.ports_row = ctk.CTkFrame(self.ports_container, fg_color="transparent")
        self.ports_row.pack(fill="x", pady=4)

        # Frontend Port Column
        self.fe_col = ctk.CTkFrame(self.ports_row, fg_color="transparent")
        self.fe_col.pack(side="left", fill="x", expand=True, padx=(0, 6))

        ctk.CTkLabel(
            self.fe_col,
            text="Frontend Port",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", pady=(0, 4))

        saved_fe_port = str(self.config_manager.get("last_used_port", 3000))
        if saved_fe_port in self.FE_PORT_OPTIONS[:-1]:
            fe_initial = saved_fe_port
            fe_custom_val = ""
        else:
            fe_initial = "Custom..."
            fe_custom_val = saved_fe_port

        self.fe_port_var = ctk.StringVar(value=fe_initial)
        self.fe_port_dropdown = ctk.CTkOptionMenu(
            self.fe_col,
            values=self.FE_PORT_OPTIONS,
            variable=self.fe_port_var,
            command=self._on_fe_port_dropdown_changed,
            fg_color="#FFFFFF",
            button_color="#E2E8F0",
            button_hover_color="#CBD5E1",
            text_color="#0F172A",
            dropdown_fg_color="#FFFFFF",
            dropdown_text_color="#0F172A",
            dropdown_hover_color="#E0F2FE",
            corner_radius=10,
            height=38
        )
        self.fe_port_dropdown.pack(fill="x")

        self.fe_custom_entry = ctk.CTkEntry(
            self.fe_col,
            placeholder_text="e.g. 3001",
            fg_color="#FFFFFF",
            border_color="#E2E8F0",
            text_color="#0F172A",
            corner_radius=10,
            height=36
        )
        if fe_initial == "Custom...":
            self.fe_custom_entry.insert(0, fe_custom_val)
            self.fe_custom_entry.pack(fill="x", pady=(4, 0))

        # Backend Port Column
        self.be_col = ctk.CTkFrame(self.ports_row, fg_color="transparent")
        self.be_col.pack(side="right", fill="x", expand=True, padx=(6, 0))

        ctk.CTkLabel(
            self.be_col,
            text="Backend Port",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", pady=(0, 4))

        self.be_port_var = ctk.StringVar(value="8000")
        self.be_port_dropdown = ctk.CTkOptionMenu(
            self.be_col,
            values=self.BE_PORT_OPTIONS,
            variable=self.be_port_var,
            command=self._on_be_port_dropdown_changed,
            fg_color="#FFFFFF",
            button_color="#E2E8F0",
            button_hover_color="#CBD5E1",
            text_color="#0F172A",
            dropdown_fg_color="#FFFFFF",
            dropdown_text_color="#0F172A",
            dropdown_hover_color="#E0F2FE",
            corner_radius=10,
            height=38
        )
        self.be_port_dropdown.pack(fill="x")

        self.be_custom_entry = ctk.CTkEntry(
            self.be_col,
            placeholder_text="e.g. 8080",
            fg_color="#FFFFFF",
            border_color="#E2E8F0",
            text_color="#0F172A",
            corner_radius=10,
            height=36
        )

        # Connection Engine Selector
        ctk.CTkLabel(
            parent,
            text="Connection Engine",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", padx=16, pady=(12, 4))

        saved_provider = self.config_manager.get("default_engine", "localhost_run")
        initial_label = self.ENGINE_REVERSE.get(saved_provider, "Auto High-Speed")

        self.provider_var = ctk.StringVar(value=initial_label)
        self.provider_dropdown = ctk.CTkOptionMenu(
            parent,
            values=["Auto High-Speed", "Fast Direct", "Secure Line"],
            variable=self.provider_var,
            fg_color="#FFFFFF",
            button_color="#E2E8F0",
            button_hover_color="#CBD5E1",
            text_color="#0F172A",
            dropdown_fg_color="#FFFFFF",
            dropdown_text_color="#0F172A",
            dropdown_hover_color="#E0F2FE",
            corner_radius=10,
            height=38
        )
        self.provider_dropdown.pack(fill="x", padx=16, pady=(0, 10))

        # Inspector Switch
        self.inspector_var = tk.BooleanVar(value=self.config_manager.get("enable_inspector", True))
        self.inspector_chk = ctk.CTkSwitch(
            parent,
            text="Enable Live HTTP Traffic Inspector",
            variable=self.inspector_var,
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#334155",
            progress_color="#4C8DFF",
            button_color="#FFFFFF",
            button_hover_color="#F1F5F9"
        )
        self.inspector_chk.pack(anchor="w", padx=16, pady=(4, 14))

        # Guide Banner Box (Soft light blue - matching Image 1)
        guide_box = ctk.CTkFrame(parent, fg_color="#EBF3FE", corner_radius=12, border_color="#DBEAFE", border_width=1)
        guide_box.pack(fill="x", padx=16, pady=(0, 16))

        guide_lbl = ctk.CTkLabel(
            guide_box,
            text="ℹ️  Guide: Ensure your local server (React, Node, Python, Django, etc.) is ALREADY RUNNING on your selected port before starting the tunnel.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            text_color="#1E40AF",
            justify="left",
            wraplength=370
        )
        guide_lbl.pack(padx=14, pady=12)

        # Big Primary Action Button (Soft vivid blue - matching Image 1)
        self.action_btn = ctk.CTkButton(
            parent,
            text="Start Tunnel",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=15, weight="bold"),
            fg_color="#70A6FF",
            hover_color="#4C8DFF",
            text_color="#FFFFFF",
            height=46,
            corner_radius=12,
            command=self._toggle_tunnel
        )
        self.action_btn.pack(fill="x", padx=16, pady=(0, 16))

    def _on_target_mode_changed(self, value: str):
        if value == "Full-Stack (One URL for both)":
            self.fe_col.pack(side="left", fill="x", expand=True, padx=(0, 6))
            self.be_col.pack(side="right", fill="x", expand=True, padx=(6, 0))
        elif value == "Frontend Only":
            self.fe_col.pack(side="left", fill="x", expand=True, padx=0)
            self.be_col.pack_forget()
        elif value == "Backend Only":
            self.fe_col.pack_forget()
            self.be_col.pack(side="left", fill="x", expand=True, padx=0)

    def _build_url_card(self, parent):
        """Card showing the active public HTTPS URL and QR Code (matching Image 1)."""
        self.url_card = ctk.CTkFrame(parent, fg_color="#FFFFFF", corner_radius=16, border_color="#E2E8F0", border_width=1)
        self.url_card.pack(fill="x", padx=0, pady=(0, 12))

        # Header Title with Circle Share Icon Badge
        header_box = ctk.CTkFrame(self.url_card, fg_color="transparent")
        header_box.pack(fill="x", padx=16, pady=(16, 12))

        icon_badge = ctk.CTkLabel(
            header_box,
            text="🔗",
            font=ctk.CTkFont(size=18),
            fg_color="#EBF3FE",
            width=42,
            height=42,
            corner_radius=21
        )
        icon_badge.pack(side="left", padx=(0, 12))

        title_box = ctk.CTkFrame(header_box, fg_color="transparent")
        title_box.pack(side="left", fill="both", expand=True)

        ctk.CTkLabel(
            title_box,
            text="Share Your App",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A",
            anchor="w"
        ).pack(anchor="w")

        ctk.CTkLabel(
            title_box,
            text="Your public link is ready to use.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            text_color="#64748B",
            anchor="w"
        ).pack(anchor="w", pady=(2, 0))

        # Link Container Box
        fe_row = ctk.CTkFrame(self.url_card, fg_color="#F8FAFC", border_color="#E2E8F0", border_width=1, corner_radius=12)
        fe_row.pack(fill="x", padx=16, pady=(0, 10))

        link_icon = ctk.CTkLabel(fe_row, text="🔗", font=ctk.CTkFont(size=14))
        link_icon.pack(side="left", padx=(12, 6))

        self.url_label = ctk.CTkEntry(
            fe_row,
            placeholder_text="https://waiting-for-tunnel...",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            fg_color="transparent",
            border_width=0,
            text_color="#0F172A"
        )
        self.url_label.pack(side="left", fill="x", expand=True, padx=4, pady=6)

        self.copy_btn = ctk.CTkButton(
            fe_row,
            text="📋 Copy",
            width=75,
            height=32,
            fg_color="#E0F2FE",
            hover_color="#BAE6FD",
            text_color="#0284C7",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            corner_radius=8,
            command=self._copy_url
        )
        self.copy_btn.pack(side="right", padx=6, pady=6)

        self.open_btn = ctk.CTkButton(
            self.url_card,
            text="🌐 Open in Browser",
            height=38,
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
            corner_radius=10,
            command=self._open_url
        )
        self.open_btn.pack(fill="x", padx=16, pady=(0, 14))

        # QR Code Container Box with soft light blue cloud graphic backdrop
        qr_container = ctk.CTkFrame(self.url_card, fg_color="#F8FAFC", corner_radius=12)
        qr_container.pack(fill="x", padx=16, pady=(0, 16))

        self.qr_label = ctk.CTkLabel(qr_container, text="[ Mobile QR Code Preview ]", text_color="#94A3B8")
        self.qr_label.pack(pady=12)

        ctk.CTkLabel(
            qr_container,
            text="📱 Scan to open on any device",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            text_color="#64748B"
        ).pack(pady=(0, 10))

    def _build_tabview(self, parent):
        """Tabbed view for Traffic Inspector, Profiles, and Output Logs (matching Image 2)."""
        self.tabview = ctk.CTkTabview(
            parent,
            fg_color="#FFFFFF",
            segmented_button_fg_color="#F1F5F9",
            segmented_button_selected_color="#4C8DFF",
            segmented_button_selected_hover_color="#3B7EFA",
            segmented_button_unselected_color="#F1F5F9",
            segmented_button_unselected_hover_color="#E2E8F0",
            text_color="#0F172A",
            corner_radius=16
        )
        self.tabview.pack(fill="both", expand=True, padx=0, pady=0)

        self.tab_inspector = self.tabview.add("Traffic Inspector")
        self.tab_profiles = self.tabview.add("Saved Profiles")
        self.tab_terminal = self.tabview.add("Tunnel Output")

        self._build_inspector_tab(self.tab_inspector)
        self._build_profiles_tab(self.tab_profiles)
        self._build_terminal_tab(self.tab_terminal)

    def _build_inspector_tab(self, tab):
        """Real-time table for inspecting incoming requests (matching Image 2)."""
        toolbar = ctk.CTkFrame(tab, fg_color="transparent")
        toolbar.pack(fill="x", pady=(0, 8))

        ctk.CTkLabel(
            toolbar,
            text="Live Incoming Requests",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=15, weight="bold"),
            text_color="#0F172A"
        ).pack(side="left")

        clear_btn = ctk.CTkButton(
            toolbar,
            text="🗑️ Clear Logs",
            width=95,
            height=28,
            fg_color="#FFFFFF",
            hover_color="#FEF2F2",
            border_color="#FECACA",
            border_width=1,
            text_color="#EF4444",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            corner_radius=8,
            command=self._clear_inspector_logs
        )
        clear_btn.pack(side="right")

        tree_frame = ttk.Frame(tab)
        tree_frame.pack(fill="both", expand=True)

        style = ttk.Style()
        style.theme_use("default")
        style.configure(
            "Treeview",
            background="#FFFFFF",
            foreground="#0F172A",
            fieldbackground="#FFFFFF",
            rowheight=28,
            font=("Segoe UI", 10)
        )
        style.configure("Treeview.Heading", background="#F8FAFC", foreground="#475569", font=("Segoe UI", 10, "bold"), relief="flat")
        style.map("Treeview", background=[("selected", "#E0F2FE")], foreground=[("selected", "#0F172A")])

        columns = ("time", "method", "path", "status", "duration", "size")
        self.inspector_tree = ttk.Treeview(tree_frame, columns=columns, show="headings", selectmode="browse")

        self.inspector_tree.heading("time", text="Time")
        self.inspector_tree.heading("method", text="Method")
        self.inspector_tree.heading("path", text="Path")
        self.inspector_tree.heading("status", text="Status")
        self.inspector_tree.heading("duration", text="Duration")
        self.inspector_tree.heading("size", text="Size")

        self.inspector_tree.column("time", width=80, anchor="center")
        self.inspector_tree.column("method", width=70, anchor="center")
        self.inspector_tree.column("path", width=240, anchor="w")
        self.inspector_tree.column("status", width=70, anchor="center")
        self.inspector_tree.column("duration", width=80, anchor="center")
        self.inspector_tree.column("size", width=70, anchor="center")

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.inspector_tree.yview)
        self.inspector_tree.configure(yscrollcommand=scrollbar.set)

        self.inspector_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

    def _build_profiles_tab(self, tab):
        """Saved port profiles tab."""
        ctk.CTkLabel(
            tab,
            text="Saved Fixed URL Profiles",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=14, weight="bold"),
            text_color="#0F172A"
        ).pack(anchor="w", pady=(0, 10))

        self.profiles_frame = ctk.CTkScrollableFrame(tab, fg_color="#F8FAFC", corner_radius=10)
        self.profiles_frame.pack(fill="both", expand=True)

        self._refresh_profiles_list()

    def _refresh_profiles_list(self):
        for widget in self.profiles_frame.winfo_children():
            widget.destroy()

        profiles = self.config_manager.get("saved_profiles", [])
        if not profiles:
            ctk.CTkLabel(self.profiles_frame, text="No saved profiles yet.", text_color="#94A3B8").pack(pady=20)
            return

        for p in profiles:
            p_card = ctk.CTkFrame(self.profiles_frame, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=8)
            p_card.pack(fill="x", padx=5, pady=4)

            info_str = f"📌 {p.get('name')}  |  Port: {p.get('port')}  |  Subdomain: {p.get('subdomain')}"
            ctk.CTkLabel(
                p_card,
                text=info_str,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
                text_color="#0F172A"
            ).pack(side="left", padx=10, pady=8)

            btn = ctk.CTkButton(
                p_card,
                text="Load & Start",
                width=90,
                height=28,
                fg_color="#4C8DFF",
                hover_color="#3B7EFA",
                text_color="#FFFFFF",
                font=ctk.CTkFont(size=12, weight="bold"),
                corner_radius=6,
                command=lambda prof=p: self._load_profile(prof)
            )
            btn.pack(side="right", padx=10)

    def _load_profile(self, profile: dict):
        fe_p = str(profile.get("port", 3000))
        if fe_p in self.FE_PORT_OPTIONS[:-1]:
            self.fe_port_var.set(fe_p)
            self.fe_custom_entry.pack_forget()
        else:
            self.fe_port_var.set("Custom...")
            self.fe_custom_entry.delete(0, tk.END)
            self.fe_custom_entry.insert(0, fe_p)
            self.fe_custom_entry.pack(fill="x", pady=(4, 0))

        be_p = str(profile.get("backend_port", 8000))
        if be_p in self.BE_PORT_OPTIONS[:-1]:
            self.be_port_var.set(be_p)
            self.be_custom_entry.pack_forget()
        else:
            self.be_port_var.set("Custom...")
            self.be_custom_entry.delete(0, tk.END)
            self.be_custom_entry.insert(0, be_p)
            self.be_custom_entry.pack(fill="x", pady=(4, 0))

        self.mode_var.set(profile.get("mode", "fixed"))
        self._on_mode_selected(profile.get("mode", "fixed"))
        self.subdomain_entry.delete(0, tk.END)
        self.subdomain_entry.insert(0, profile.get("subdomain", ""))
        self._log_terminal(f"[Share Port] Loaded profile '{profile.get('name')}'.")

    def _build_terminal_tab(self, tab):
        """Raw engine console output tab."""
        self.terminal_text = ctk.CTkTextbox(
            tab,
            font=ctk.CTkFont(family="Consolas", size=11),
            fg_color="#0F172A",
            text_color="#38BDF8",
            corner_radius=10
        )
        self.terminal_text.pack(fill="both", expand=True)

    def _log_terminal(self, msg: str):
        self.terminal_text.insert("end", f"{msg}\n")
        self.terminal_text.see("end")

    def _on_fe_port_dropdown_changed(self, choice: str):
        if choice == "Custom...":
            self.fe_custom_entry.pack(fill="x", pady=(4, 0))
            self.fe_custom_entry.focus()
        else:
            self.fe_custom_entry.pack_forget()

    def _on_be_port_dropdown_changed(self, choice: str):
        if choice == "Custom...":
            self.be_custom_entry.pack(fill="x", pady=(4, 0))
            self.be_custom_entry.focus()
        else:
            self.be_custom_entry.pack_forget()

    def _get_frontend_port(self) -> int:
        choice = self.fe_port_var.get()
        if choice == "Custom...":
            val = self.fe_custom_entry.get().strip()
            try:
                return int(val) if val else 3000
            except ValueError:
                return 3000
        else:
            try:
                return int(choice)
            except ValueError:
                return 3000

    def _get_backend_port(self) -> int:
        choice = self.be_port_var.get()
        if choice == "Custom...":
            val = self.be_custom_entry.get().strip()
            try:
                return int(val) if val else 8000
            except ValueError:
                return 8000
        else:
            try:
                return int(choice)
            except ValueError:
                return 8000

    def _on_port_changed(self, event=None):
        pass

    def _load_saved_port_defaults(self):
        pass

    def _toggle_tunnel(self):
        if self.engine and self.engine.status in ["STARTING", "CONNECTED"]:
            self._stop_tunnel()
        else:
            self._start_tunnel()

    def _start_tunnel(self):
        target_mode = self.target_mode_var.get()

        port = self._get_frontend_port()
        backend_port = self._get_backend_port()

        if target_mode == "Full-Stack (One URL for both)":
            if backend_port == port:
                backend_port = 8000 if port != 8000 else 8001
            enable_fullstack = True
        elif target_mode == "Frontend Only":
            enable_fullstack = False
            backend_port = 0
        else:  # Backend Only
            port = backend_port
            enable_fullstack = False
            backend_port = 0

        mode = "random"
        subdomain = ""

        ui_engine = self.provider_dropdown.get()
        provider = self.ENGINE_MAP.get(ui_engine, "localhost_run")
        enable_inspector = self.inspector_var.get()

        # Save preferences
        self.config_manager.set("last_used_port", port)
        self.config_manager.set("default_engine", provider)

        # Update UI to Connecting
        self.action_btn.configure(text="⏳ Connecting...", fg_color="#F59E0B", hover_color="#D97706")
        self.status_badge.configure(text="● ⏳ Connecting...", text_color="#92400E", fg_color="#FEF3C7")
        self.url_label.delete(0, tk.END)
        self.url_label.insert(0, "⚡ Generating live HTTPS URL... Please wait")

        self._log_terminal(f"[Share Port] Starting Gateway for Port {port} via {ui_engine}...")

        # Initialize and start Gateway Engine
        self.engine = TunnelEngine(
            local_port=port,
            subdomain=subdomain,
            mode=mode,
            provider=provider,
            backend_port=backend_port if enable_fullstack else 0,
            enable_unified_fullstack=enable_fullstack,
            enable_inspector=enable_inspector,
            on_status_change=self._on_engine_status,
            on_request_log=self._on_request_log
        )
        self.engine.start()

    def _stop_tunnel(self):
        if self.engine:
            self.engine.stop()
            self.engine = None

        self.action_btn.configure(text="Start Tunnel", fg_color="#70A6FF", hover_color="#4C8DFF")
        self.status_badge.configure(text="● Disconnected", text_color="#991B1B", fg_color="#FEE2E2")
        self.url_label.delete(0, tk.END)
        self.url_label.insert(0, "")

        try:
            self.qr_label.configure(image="", text="[ Mobile QR Code Preview ]")
        except Exception:
            pass

        self._log_terminal("[Share Port] Tunnel stopped.")

    def _on_engine_status(self, status: str, url: str, error: str):
        self.after(0, lambda: self._update_ui_status(status, url, error))

    def _update_ui_status(self, status: str, url: str, error: str):
        if status == "CONNECTED":
            self.action_btn.configure(text="Stop Tunnel", fg_color="#EF4444", hover_color="#DC2626")
            self.status_badge.configure(text="● Live Online", text_color="#166534", fg_color="#DCFCE7")
            self.url_label.delete(0, tk.END)
            self.url_label.insert(0, url)
            self._log_terminal(f"[SUCCESS] Public HTTPS URL: {url}")

            try:
                qr_pil = generate_image_qr(url, size=140)
                qr_ctk = ctk.CTkImage(light_image=qr_pil, dark_image=qr_pil, size=(140, 140))
                self.qr_label.configure(image=qr_ctk, text="")
            except Exception as e:
                print(f"QR Error: {e}")

            if self.config_manager.get("auto_copy_url", True):
                self._copy_url()

        elif status == "ERROR":
            self.status_badge.configure(text="● Error", text_color="#991B1B", fg_color="#FEE2E2")
            self.url_label.delete(0, tk.END)
            self.url_label.insert(0, "Error starting tunnel")
            self._log_terminal(f"[ERROR] {error}")
            self._stop_tunnel()

    def _on_request_log(self, req: RequestLog):
        self.after(0, lambda: self._add_inspector_row(req))

    def _add_inspector_row(self, req: RequestLog):
        row_dict = req.to_dict()
        item_id = self.inspector_tree.insert(
            "",
            0,
            values=(
                row_dict["timestamp"],
                row_dict["method"],
                row_dict["path"],
                row_dict["status"],
                row_dict["duration"],
                row_dict["res_size"]
            )
        )
        if 200 <= req.response_status < 300:
            self.inspector_tree.item(item_id, tags=("status_ok",))
        elif 400 <= req.response_status < 500:
            self.inspector_tree.item(item_id, tags=("status_warn",))
        else:
            self.inspector_tree.item(item_id, tags=("status_err",))

        self.inspector_tree.tag_configure("status_ok", foreground="#16A34A")
        self.inspector_tree.tag_configure("status_warn", foreground="#D97706")
        self.inspector_tree.tag_configure("status_err", foreground="#DC2626")

    def _clear_inspector_logs(self):
        for item in self.inspector_tree.get_children():
            self.inspector_tree.delete(item)

    def _copy_url(self):
        url = self.url_label.get().strip()
        if url and url.startswith("http"):
            self.clipboard_clear()
            self.clipboard_append(url)
            self.update()
            self.copy_btn.configure(text="✓ Copied!", fg_color="#DCFCE7", text_color="#166534")
            self.after(1500, lambda: self.copy_btn.configure(text="📋 Copy", fg_color="#E0F2FE", text_color="#0284C7"))

    def _open_url(self):
        url = self.url_label.get().strip()
        if url and url.startswith("http"):
            webbrowser.open(url)

    def _on_close(self):
        if self.engine:
            self.engine.stop()
        self.destroy()
