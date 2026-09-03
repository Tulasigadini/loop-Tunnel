import customtkinter as ctk
import tkinter as tk
from tkinter import ttk, messagebox
import PIL.ImageTk
import PIL.Image
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

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")


class LloopGUI(ctk.CTk):
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
        # Window setup
        self.title("LLOOP PORT - Zero-Config Full-Stack Localhost Tunneling")
        self.geometry("980x740")
        self.minsize(920, 680)

        # Build UI layout
        self._build_header()
        self._build_main_layout()
        self._load_saved_port_defaults()

        # Bind close event
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # Silently check for updates in background (zero interruption on fail)
        if self.config_manager.get("enable_auto_update_check", True):
            self.updater.check_for_updates_async(
                on_update_available=self._on_update_found
            )

        # Check remote access control policy asynchronously
        threading.Thread(target=self._check_access_policy, daemon=True).start()

    def _build_header(self):
        """Header banner with logo, update badge, and status badge."""
        self.header_frame = ctk.CTkFrame(self, fg_color="#161b22", corner_radius=0, height=65)
        self.header_frame.pack(fill="x", side="top")
        self.header_frame.pack_propagate(False)

        # Title & Subtitle
        title_label = ctk.CTkLabel(
            self.header_frame,
            text="⚡ LLOOP PORT",
            font=ctk.CTkFont(family="Segoe UI", size=22, weight="bold"),
            text_color="#58a6ff"
        )
        title_label.pack(side="left", padx=(20, 10), pady=12)

        subtitle_label = ctk.CTkLabel(
            self.header_frame,
            text="Single-URL Full-Stack Tunneling for Frontend & Backend",
            font=ctk.CTkFont(family="Segoe UI", size=13),
            text_color="#8b949e"
        )
        subtitle_label.pack(side="left", padx=0, pady=16)

        # Connection Status Badge
        self.status_badge = ctk.CTkLabel(
            self.header_frame,
            text="● DISCONNECTED",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            text_color="#f85149",
            fg_color="#21262d",
            corner_radius=12,
            padx=12,
            pady=4
        )
        self.status_badge.pack(side="right", padx=20, pady=16)

        # Help & Queries Button
        self.help_btn = ctk.CTkButton(
            self.header_frame,
            text="🌐 Help & Queries",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            fg_color="#1f6feb",
            hover_color="#388bfd",
            text_color="#ffffff",
            corner_radius=12,
            height=28,
            command=lambda: webbrowser.open("https://lloop-tunnel.vercel.app")
        )
        self.help_btn.pack(side="right", padx=(0, 10), pady=16)

        # Update Notification Badge (hidden by default)
        self.update_btn = ctk.CTkButton(
            self.header_frame,
            text="🔔 Update Available",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            fg_color="#d29922",
            hover_color="#b0801a",
            text_color="#ffffff",
            corner_radius=12,
            height=28,
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
            self.update_btn.pack(side="right", padx=(0, 10), pady=16)

    def _open_update_dialog(self):
        """Opens clean update modal dialog."""
        if not self.latest_update_info:
            return

        remote_ver = self.latest_update_info.get("version", "Latest")
        changelog = self.latest_update_info.get("changelog", "Bug fixes & performance improvements.")
        download_url = self.latest_update_info.get("download_url", "")

        dialog = ctk.CTkToplevel(self)
        dialog.title("LLOOP PORT Software Update")
        dialog.geometry("450x320")
        dialog.resizable(False, False)
        dialog.grab_set()

        ctk.CTkLabel(
            dialog,
            text=f"🚀 LLOOP PORT v{remote_ver} Available!",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color="#58a6ff"
        ).pack(pady=(20, 5))

        ctk.CTkLabel(
            dialog,
            text=f"Current Version: v{APP_VERSION}  ➔  New Version: v{remote_ver}",
            font=ctk.CTkFont(size=12),
            text_color="#8b949e"
        ).pack(pady=2)

        # Changelog box
        changelog_frame = ctk.CTkFrame(dialog, fg_color="#161b22", corner_radius=8)
        changelog_frame.pack(fill="both", expand=True, padx=20, pady=15)

        ctk.CTkLabel(
            changelog_frame,
            text="What's New:",
            font=ctk.CTkFont(size=12, weight="bold"),
            anchor="w"
        ).pack(anchor="w", padx=10, pady=(8, 2))

        lbl = ctk.CTkLabel(
            changelog_frame,
            text=changelog,
            font=ctk.CTkFont(size=11),
            text_color="#c9d1d9",
            justify="left",
            wraplength=380
        )
        lbl.pack(anchor="w", padx=10, pady=(0, 8))

        # Download progress bar (hidden until update clicked)
        progress_bar = ctk.CTkProgressBar(dialog, width=380)
        progress_bar.set(0)

        status_lbl = ctk.CTkLabel(dialog, text="", font=ctk.CTkFont(size=11), text_color="#58a6ff")

        def start_download():
            btn_update.configure(state="disabled", text="⏳ Downloading...")
            progress_bar.pack(pady=(0, 5))
            status_lbl.pack(pady=(0, 10))

            def on_progress(pct, dl_mb, tot_mb):
                def _update_ui():
                    progress_bar.set(pct)
                    if pct >= 1.0:
                        status_lbl.configure(text=f"Download complete! (100%) — Verifying...", text_color="#3fb950")
                    elif tot_mb > 0:
                        status_lbl.configure(text=f"Downloading update... {int(pct*100)}% ({dl_mb:.1f} MB / {tot_mb:.1f} MB)", text_color="#58a6ff")
                    else:
                        status_lbl.configure(text=f"Downloading update... ({dl_mb:.1f} MB)", text_color="#58a6ff")
                self.after(0, _update_ui)

            def do_restart():
                btn_update.configure(state="disabled", text="Restarting...")
                status_lbl.configure(text="Closing app and launching new version...", text_color="#3fb950")
                self.after(200, self.updater.apply_pending_update)

            def on_complete(success, msg):
                def _ui_done():
                    if success:
                        status_lbl.configure(text=msg, text_color="#3fb950")
                        btn_update.configure(
                            state="normal",
                            text="🚀 Restart & Apply",
                            fg_color="#238636",
                            hover_color="#2ea043",
                            command=do_restart
                        )
                    else:
                        status_lbl.configure(text=msg, text_color="#f85149")
                        btn_update.configure(state="normal", text="Retry Update", command=start_download)
                self.after(0, _ui_done)

            expected_hash = self.latest_update_info.get("sha256")
            self.updater.download_and_install_async(download_url, on_progress, on_complete, expected_sha256=expected_hash)

        btn_frame = ctk.CTkFrame(dialog, fg_color="transparent")
        btn_frame.pack(fill="x", padx=20, pady=(0, 20))

        btn_cancel = ctk.CTkButton(
            btn_frame,
            text="Later",
            fg_color="#21262d",
            hover_color="#30363d",
            command=dialog.destroy,
            width=100
        )
        btn_cancel.pack(side="left")

        btn_update = ctk.CTkButton(
            btn_frame,
            text="Update & Restart App",
            fg_color="#238636",
            hover_color="#2ea043",
            command=start_download
        )
        btn_update.pack(side="right")

    def _build_main_layout(self):
        """Split screen into Controls/URL panel on left, Inspector/Tabs on right."""
        self.body_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.body_frame.pack(fill="both", expand=True, padx=15, pady=15)
        self.main_container = self.body_frame

        # Left Column (Scrollable Controls & Public URL Card)
        self.left_col = ctk.CTkScrollableFrame(self.body_frame, width=420, fg_color="#161b22", corner_radius=10)
        self.left_col.pack(side="left", fill="both", expand=False, padx=(0, 10))

        self._build_control_panel(self.left_col)
        self._build_url_card(self.left_col)

        # Right Column (Tabview: Inspector, Profiles, System Log)
        self.right_col = ctk.CTkFrame(self.body_frame, fg_color="#161b22", corner_radius=10)
        self.right_col.pack(side="right", fill="both", expand=True)

        self._build_tabview(self.right_col)

    def _check_access_policy(self):
        """Asynchronously checks remote access control policy."""
        status = AccessControlManager.check_access(APP_VERSION, self.config_manager)
        if status.is_restricted:
            self.after(0, lambda: self._show_access_restricted_overlay(status))

    def _show_access_restricted_overlay(self, status: AccessStatus):
        """Renders full dark-mode lock overlay screen blocking tunnel controls until acknowledged or action taken."""
        if hasattr(self, "overlay_frame") and self.overlay_frame.winfo_exists():
            return

        self.overlay_frame = ctk.CTkFrame(self.main_container, fg_color="#0d1117", corner_radius=12)
        self.overlay_frame.place(relx=0.5, rely=0.5, anchor="center", relwidth=0.98, relheight=0.98)

        # Content card inside overlay
        card = ctk.CTkFrame(self.overlay_frame, fg_color="#161b22", corner_radius=12, border_color="#30363d", border_width=1)
        card.pack(expand=True, padx=40, pady=40, fill="both")

        ctk.CTkLabel(
            card,
            text=status.title or "📢 Important Notice",
            font=ctk.CTkFont(size=22, weight="bold"),
            text_color="#58a6ff"
        ).pack(pady=(40, 15))

        msg_lbl = ctk.CTkLabel(
            card,
            text=status.message or "Access to the GUI is currently restricted.",
            font=ctk.CTkFont(size=14),
            text_color="#c9d1d9",
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
                    webbrowser.open(status.action_url or "https://lloop-tunnel.vercel.app")
            elif status.action_type == "url":
                if status.action_url:
                    webbrowser.open(status.action_url)
            else:
                self.overlay_frame.destroy()

        btn_text = status.action_button_text or ("👍 OK, Continue" if status.action_type == "ok" else "Action Required")
        action_btn = ctk.CTkButton(
            card,
            text=btn_text,
            font=ctk.CTkFont(size=15, weight="bold"),
            fg_color="#238636",
            hover_color="#2ea043",
            height=44,
            width=220,
            corner_radius=8,
            command=on_action_clicked
        )
        action_btn.pack(pady=(10, 30))

    def _build_control_panel(self, parent):
        """Controls section for ports, subdomain mode, and engine."""
        self.ENGINE_MAP = {
            "Auto High-Speed": "cloudflare",
            "Fast Direct": "localhost_run",
            "Secure Line": "serveo"
        }
        self.ENGINE_REVERSE = {v: k for k, v in self.ENGINE_MAP.items()}

        ctk.CTkLabel(
            parent,
            text="Tunnel Settings",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color="#c9d1d9"
        ).pack(anchor="w", padx=15, pady=(12, 6))

        # Target Mode Selector
        ctk.CTkLabel(parent, text="Target Mode:", font=ctk.CTkFont(size=13, weight="bold")).pack(anchor="w", padx=15, pady=(4, 2))

        self.target_mode_var = ctk.StringVar(value="Full-Stack (One URL for both)")
        self.target_mode_selector = ctk.CTkOptionMenu(
            parent,
            values=["Full-Stack (One URL for both)", "Frontend Only", "Backend Only"],
            variable=self.target_mode_var,
            command=self._on_target_mode_changed,
            dropdown_hover_color="#1f6feb"
        )
        self.target_mode_selector.pack(fill="x", padx=15, pady=4)

        # Container for Port Inputs
        self.ports_container = ctk.CTkFrame(parent, fg_color="transparent")
        self.ports_container.pack(fill="x", padx=15, pady=4)

        self.FE_PORT_OPTIONS = ["3000", "5173", "5000", "8000", "8080", "4000", "9000", "Custom..."]
        self.BE_PORT_OPTIONS = ["8000", "5000", "8080", "4000", "3000", "5173", "9000", "Custom..."]

        # Frontend Port Container
        self.port_frame = ctk.CTkFrame(self.ports_container, fg_color="transparent")
        self.port_frame.pack(fill="x", pady=4)

        fe_hdr = ctk.CTkFrame(self.port_frame, fg_color="transparent")
        fe_hdr.pack(fill="x")
        ctk.CTkLabel(fe_hdr, text="Frontend Port:", font=ctk.CTkFont(size=12, weight="bold")).pack(side="left")

        saved_fe_port = str(self.config_manager.get("last_used_port", 3000))
        if saved_fe_port in self.FE_PORT_OPTIONS[:-1]:
            fe_initial = saved_fe_port
            fe_custom_val = ""
        else:
            fe_initial = "Custom..."
            fe_custom_val = saved_fe_port

        self.fe_port_var = ctk.StringVar(value=fe_initial)
        self.fe_port_dropdown = ctk.CTkOptionMenu(
            fe_hdr,
            values=self.FE_PORT_OPTIONS,
            variable=self.fe_port_var,
            width=130,
            command=self._on_fe_port_dropdown_changed,
            dropdown_hover_color="#1f6feb"
        )
        self.fe_port_dropdown.pack(side="right")

        self.fe_custom_entry = ctk.CTkEntry(self.port_frame, placeholder_text="Enter custom port (e.g. 3001)")
        if fe_initial == "Custom...":
            self.fe_custom_entry.insert(0, fe_custom_val)
            self.fe_custom_entry.pack(fill="x", pady=(4, 0))

        # Backend Port Container
        self.backend_port_frame = ctk.CTkFrame(self.ports_container, fg_color="transparent")
        self.backend_port_frame.pack(fill="x", pady=4)

        be_hdr = ctk.CTkFrame(self.backend_port_frame, fg_color="transparent")
        be_hdr.pack(fill="x")
        ctk.CTkLabel(be_hdr, text="Backend Port:", font=ctk.CTkFont(size=12, weight="bold")).pack(side="left")

        self.be_port_var = ctk.StringVar(value="8000")
        self.be_port_dropdown = ctk.CTkOptionMenu(
            be_hdr,
            values=self.BE_PORT_OPTIONS,
            variable=self.be_port_var,
            width=130,
            command=self._on_be_port_dropdown_changed,
            dropdown_hover_color="#1f6feb"
        )
        self.be_port_dropdown.pack(side="right")

        self.be_custom_entry = ctk.CTkEntry(self.backend_port_frame, placeholder_text="Enter custom port (e.g. 8080)")

        # Tunnel Engine Provider Selector (Clean labels without server words!)
        ctk.CTkLabel(parent, text="Tunnel Connection Engine:", font=ctk.CTkFont(size=13, weight="bold")).pack(anchor="w", padx=15, pady=(8, 4))

        saved_provider = self.config_manager.get("default_engine", "localhost_run")
        initial_label = self.ENGINE_REVERSE.get(saved_provider, "Auto High-Speed")

        self.provider_var = ctk.StringVar(value=initial_label)
        self.provider_dropdown = ctk.CTkOptionMenu(
            parent,
            values=["Auto High-Speed", "Fast Direct", "Secure Line"],
            variable=self.provider_var,
            dropdown_hover_color="#1f6feb"
        )
        self.provider_dropdown.pack(fill="x", padx=15, pady=4)

        # Inspector Checkbox
        self.inspector_var = tk.BooleanVar(value=self.config_manager.get("enable_inspector", True))
        self.inspector_chk = ctk.CTkCheckBox(
            parent,
            text="Enable Live HTTP Traffic Inspector",
            variable=self.inspector_var,
            font=ctk.CTkFont(size=12)
        )
        self.inspector_chk.pack(anchor="w", padx=15, pady=(6, 10))

        # Quick Server Checklist Guide Box
        guide_box = ctk.CTkFrame(parent, fg_color="#0d1117", corner_radius=8, border_color="#30363d", border_width=1)
        guide_box.pack(fill="x", padx=15, pady=(4, 10))

        guide_lbl = ctk.CTkLabel(
            guide_box,
            text="💡 Guide: Ensure your local server (React, Node, Python, Django, etc.) is ALREADY RUNNING on your selected port before starting the tunnel.",
            font=ctk.CTkFont(size=11),
            text_color="#79c0ff",
            justify="left",
            wraplength=370
        )
        guide_lbl.pack(padx=10, pady=8)

        # Big Start / Stop Button
        self.action_btn = ctk.CTkButton(
            parent,
            text="⚡ START TUNNEL",
            font=ctk.CTkFont(size=15, weight="bold"),
            fg_color="#238636",
            hover_color="#2ea043",
            height=40,
            corner_radius=8,
            command=self._toggle_tunnel
        )
        self.action_btn.pack(fill="x", padx=15, pady=(0, 10))

    def _on_target_mode_changed(self, value: str):
        if value == "Full-Stack (One URL for both)":
            self.port_frame.pack(fill="x", pady=2)
            self.backend_port_frame.pack(fill="x", pady=2)
        elif value == "Frontend Only":
            self.port_frame.pack(fill="x", pady=2)
            self.backend_port_frame.pack_forget()
        elif value == "Backend Only":
            self.port_frame.pack_forget()
            self.backend_port_frame.pack(fill="x", pady=2)

    def _build_url_card(self, parent):
        """Card showing the active public HTTPS URL and QR Code."""
        self.url_card = ctk.CTkFrame(parent, fg_color="#0d1117", corner_radius=8, border_color="#30363d", border_width=1)
        self.url_card.pack(fill="both", expand=True, padx=15, pady=(0, 12))

        ctk.CTkLabel(self.url_card, text="Unified Public HTTPS URL (All Devices)", font=ctk.CTkFont(size=12, weight="bold"), text_color="#79c0ff").pack(anchor="w", padx=12, pady=(8, 2))

        fe_row = ctk.CTkFrame(self.url_card, fg_color="transparent")
        fe_row.pack(fill="x", padx=12, pady=2)

        self.url_label = ctk.CTkEntry(
            fe_row,
            placeholder_text="https://waiting-for-tunnel...",
            font=ctk.CTkFont(size=11),
            fg_color="#161b22",
            border_color="#30363d"
        )
        self.url_label.pack(side="left", fill="x", expand=True, padx=(0, 5))

        self.copy_btn = ctk.CTkButton(
            fe_row,
            text="📋 Copy",
            width=70,
            fg_color="#21262d",
            hover_color="#30363d",
            command=self._copy_url
        )
        self.copy_btn.pack(side="right")

        self.open_btn = ctk.CTkButton(
            self.url_card,
            text="🌐 Open in Browser",
            height=28,
            fg_color="#21262d",
            hover_color="#30363d",
            command=self._open_url
        )
        self.open_btn.pack(fill="x", padx=12, pady=4)

        # QR Code Container
        self.qr_label = ctk.CTkLabel(self.url_card, text="[ Mobile QR Code Preview ]", text_color="#484f58")
        self.qr_label.pack(pady=6)

        # Help & Queries Card
        help_card = ctk.CTkFrame(parent, fg_color="#0d1117", corner_radius=8)
        help_card.pack(fill="x", padx=12, pady=(12, 10))

        ctk.CTkLabel(
            help_card,
            text="💬 Need help or have queries?",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color="#c9d1d9"
        ).pack(anchor="w", padx=10, pady=(6, 1))

        help_link = ctk.CTkButton(
            help_card,
            text="🌐 Visit website for help & queries:\nhttps://lloop-tunnel.vercel.app",
            font=ctk.CTkFont(size=11),
            text_color="#58a6ff",
            fg_color="transparent",
            hover_color="#161b22",
            anchor="w",
            command=lambda: webbrowser.open("https://lloop-tunnel.vercel.app")
        )
        help_link.pack(fill="x", padx=6, pady=(0, 6))

    def _build_tabview(self, parent):
        """Tabbed view for Traffic Inspector, Profiles, and Output Logs."""
        self.tabview = ctk.CTkTabview(parent, fg_color="#161b22")
        self.tabview.pack(fill="both", expand=True, padx=10, pady=10)

        self.tab_inspector = self.tabview.add("🔍 Traffic Inspector")
        self.tab_profiles = self.tabview.add("⭐ Saved Profiles")
        self.tab_terminal = self.tabview.add("📜 Tunnel Output")

        self._build_inspector_tab(self.tab_inspector)
        self._build_profiles_tab(self.tab_profiles)
        self._build_terminal_tab(self.tab_terminal)

    def _build_inspector_tab(self, tab):
        """Real-time table for inspecting incoming requests."""
        toolbar = ctk.CTkFrame(tab, fg_color="transparent")
        toolbar.pack(fill="x", pady=(0, 5))

        ctk.CTkLabel(toolbar, text="Live Incoming Requests", font=ctk.CTkFont(size=14, weight="bold")).pack(side="left")

        clear_btn = ctk.CTkButton(
            toolbar,
            text="🗑️ Clear Logs",
            width=90,
            height=26,
            fg_color="#21262d",
            hover_color="#30363d",
            command=self._clear_inspector_logs
        )
        clear_btn.pack(side="right")

        tree_frame = ttk.Frame(tab)
        tree_frame.pack(fill="both", expand=True)

        style = ttk.Style()
        style.theme_use("default")
        style.configure(
            "Treeview",
            background="#0d1117",
            foreground="#c9d1d9",
            fieldbackground="#0d1117",
            rowheight=26,
            font=("Consolas", 10)
        )
        style.configure("Treeview.Heading", background="#21262d", foreground="#58a6ff", font=("Segoe UI", 10, "bold"))
        style.map("Treeview", background=[("selected", "#1f6feb")], foreground=[("selected", "#ffffff")])

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
        ctk.CTkLabel(tab, text="Saved Fixed URL Profiles", font=ctk.CTkFont(size=14, weight="bold")).pack(anchor="w", pady=(0, 10))

        self.profiles_frame = ctk.CTkScrollableFrame(tab, fg_color="#0d1117")
        self.profiles_frame.pack(fill="both", expand=True)

        self._refresh_profiles_list()

    def _refresh_profiles_list(self):
        for widget in self.profiles_frame.winfo_children():
            widget.destroy()

        profiles = self.config_manager.get("saved_profiles", [])
        if not profiles:
            ctk.CTkLabel(self.profiles_frame, text="No saved profiles yet.", text_color="#8b949e").pack(pady=20)
            return

        for p in profiles:
            p_card = ctk.CTkFrame(self.profiles_frame, fg_color="#161b22", corner_radius=6)
            p_card.pack(fill="x", padx=5, pady=4)

            info_str = f"📌 {p.get('name')}  |  Port: {p.get('port')}  |  Subdomain: {p.get('subdomain')}"
            ctk.CTkLabel(p_card, text=info_str, font=ctk.CTkFont(size=12, weight="bold")).pack(side="left", padx=10, pady=8)

            btn = ctk.CTkButton(
                p_card,
                text="Load & Start",
                width=90,
                height=26,
                fg_color="#1f6feb",
                hover_color="#388bfd",
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
        self._log_terminal(f"[LLOOP] Loaded profile '{profile.get('name')}'.")

    def _build_terminal_tab(self, tab):
        """Raw engine stdout/stderr console."""
        self.terminal_text = ctk.CTkTextbox(tab, font=ctk.CTkFont(family="Consolas", size=11), fg_color="#0d1117", text_color="#7ee787")
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

        # Update UI to Generating
        self.action_btn.configure(text="⏳ GENERATING...", fg_color="#bd2c00", hover_color="#d73a49")
        self.status_badge.configure(text="● ⏳ GENERATING LIVE HTTPS URL...", text_color="#d29922")
        self.url_label.delete(0, tk.END)
        self.url_label.insert(0, "⚡ Generating live HTTPS URL... Please wait")

        self._log_terminal(f"[LLOOP] Starting Gateway for Port {port} via {ui_engine}...")

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

        self.action_btn.configure(text="⚡ START TUNNEL", fg_color="#238636", hover_color="#2ea043")
        self.status_badge.configure(text="● DISCONNECTED", text_color="#f85149")
        self.url_label.delete(0, tk.END)
        self.url_label.insert(0, "")

        try:
            self.qr_label.configure(image="", text="[ Mobile QR Code Preview ]")
        except Exception:
            pass

        self._log_terminal("[LLOOP] Tunnel stopped.")

    def _on_engine_status(self, status: str, url: str, error: str):
        self.after(0, lambda: self._update_ui_status(status, url, error))

    def _update_ui_status(self, status: str, url: str, error: str):
        if status == "CONNECTED":
            self.action_btn.configure(text="⏳ STOP TUNNEL", fg_color="#bd2c00", hover_color="#d73a49")
            self.status_badge.configure(text="● LIVE ONLINE", text_color="#3fb950")
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
            self.status_badge.configure(text="● ERROR", text_color="#f85149")
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

        self.inspector_tree.tag_configure("status_ok", foreground="#3fb950")
        self.inspector_tree.tag_configure("status_warn", foreground="#d29922")
        self.inspector_tree.tag_configure("status_err", foreground="#f85149")

    def _clear_inspector_logs(self):
        for item in self.inspector_tree.get_children():
            self.inspector_tree.delete(item)

    def _copy_url(self):
        url = self.url_label.get().strip()
        if url and url.startswith("http"):
            self.clipboard_clear()
            self.clipboard_append(url)
            self.update()
            self.copy_btn.configure(text="✓ Copied!", fg_color="#238636")
            self.after(1500, lambda: self.copy_btn.configure(text="📋 Copy", fg_color="#21262d"))

    def _open_url(self):
        url = self.url_label.get().strip()
        if url and url.startswith("http"):
            webbrowser.open(url)

    def _on_close(self):
        if self.engine:
            self.engine.stop()
        self.destroy()
