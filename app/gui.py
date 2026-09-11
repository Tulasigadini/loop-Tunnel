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

        # Window setup
        self.title("Share Port - Zero-Config Full-Stack Localhost Tunneling")
        self.geometry("1060x780")
        self.minsize(980, 700)
        self.configure(fg_color="#F4F7FC")

        # Set window icon
        icon_path = get_resource_path("app_icon.ico")
        if os.path.exists(icon_path):
            try:
                self.iconbitmap(icon_path)
            except Exception:
                pass

        # Build UI Header, Navigation Bar, and Page Views
        self._build_header()
        self._build_nav_tabs()
        self._build_pages()
        self._load_saved_port_defaults()

        # Bind close event
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # Initialize Auto-Updater Engine
        update_url = self.config_manager.get("update_url")
        self.updater = AppUpdater(current_version=APP_VERSION, update_url=update_url)

        # Silently check for updates in background
        if self.config_manager.get("enable_auto_update_check", True):
            self.updater.check_for_updates_async(
                on_update_available=self._on_update_found
            )

        # Check remote access control policy asynchronously
        threading.Thread(target=self._check_access_policy, daemon=True).start()

    def _build_header(self):
        """Top Header banner with brand logo, title, status badge, and help button."""
        self.header_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=0, height=64, border_color="#E2E8F0", border_width=1)
        self.header_frame.pack(fill="x", side="top")
        self.header_frame.pack_propagate(False)

        # Left Container: Logo + Title + Subtitle
        left_header = ctk.CTkFrame(self.header_frame, fg_color="transparent")
        left_header.pack(side="left", padx=20, pady=10)

        icon_path = get_resource_path("app_icon.ico")
        if os.path.exists(icon_path):
            try:
                pil_logo = Image.open(icon_path).convert("RGBA")
                self.app_logo_img = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(36, 36))
                title_label = ctk.CTkLabel(
                    left_header,
                    text=" Share Port",
                    image=self.app_logo_img,
                    compound="left",
                    font=ctk.CTkFont(family="Plus Jakarta Sans", size=22, weight="bold"),
                    text_color="#0F172A"
                )
            except Exception:
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
            text="Share Localhost Servers Securely to Public Web",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#64748B"
        )
        subtitle_label.pack(side="left", pady=(4, 0))

        # Right Container: Status Badge + Help Button
        right_header = ctk.CTkFrame(self.header_frame, fg_color="transparent")
        right_header.pack(side="right", padx=20, pady=12)

        # Connection Status Badge
        self.status_badge = ctk.CTkLabel(
            right_header,
            text="● DISCONNECTED",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#991B1B",
            fg_color="#FEE2E2",
            corner_radius=20,
            padx=14,
            pady=5
        )
        self.status_badge.pack(side="right", padx=(10, 0))

        # Official Website Button (Direct link at top)
        self.help_btn = ctk.CTkButton(
            right_header,
            text="🌐 Visit Website (shareport.in)",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            fg_color="#FFFFFF",
            hover_color="#F8FAFC",
            text_color="#2563EB",
            border_color="#CBD5E1",
            border_width=1,
            corner_radius=20,
            height=32,
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

    def _build_nav_tabs(self):
        """Top Navigation Tab Bar (matching Reference Image 2)."""
        self.nav_bar = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=0, height=48, border_color="#E2E8F0", border_width=1)
        self.nav_bar.pack(fill="x", side="top")
        self.nav_bar.pack_propagate(False)

        self.nav_buttons = {}
        tabs = [
            ("setup", "🚀 Tunnel Setup"),
            ("about", "ℹ️ About & Trust"),
            ("inspector", "🔍 Traffic Inspector"),
            ("profiles", "⭐ Saved Profiles"),
            ("terminal", "📜 Tunnel Output")
        ]

        left_nav = ctk.CTkFrame(self.nav_bar, fg_color="transparent")
        left_nav.pack(side="left", padx=20, pady=6)

        for key, label in tabs:
            btn = ctk.CTkButton(
                left_nav,
                text=label,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
                fg_color="transparent",
                hover_color="#F1F5F9",
                text_color="#64748B",
                height=36,
                corner_radius=8,
                command=lambda k=key: self._switch_page(k)
            )
            btn.pack(side="left", padx=4)
            self.nav_buttons[key] = btn

    def _build_pages(self):
        """Container for page views."""
        self.pages_container = ctk.CTkFrame(self, fg_color="transparent")
        self.pages_container.pack(fill="both", expand=True, padx=20, pady=16)

        self.pages = {}

        # 1. Page: Tunnel Setup (Full 2-Column Responsive View)
        self.pages["setup"] = ctk.CTkFrame(self.pages_container, fg_color="transparent")
        self._build_setup_page(self.pages["setup"])

        # 2. Page: Traffic Inspector (Full-width Page)
        self.pages["inspector"] = ctk.CTkFrame(self.pages_container, fg_color="transparent")
        self._build_inspector_page(self.pages["inspector"])

        # 3. Page: Saved Profiles
        self.pages["profiles"] = ctk.CTkFrame(self.pages_container, fg_color="transparent")
        self._build_profiles_page(self.pages["profiles"])

        # 4. Page: About & Developer Trust Guide
        self.pages["about"] = ctk.CTkFrame(self.pages_container, fg_color="transparent")
        self._build_about_page(self.pages["about"])

        # 5. Page: Tunnel Output Console
        self.pages["terminal"] = ctk.CTkFrame(self.pages_container, fg_color="transparent")
        self._build_terminal_page(self.pages["terminal"])

        # Show default page
        self._switch_page("setup")

    def _switch_page(self, page_name: str):
        """Switches active page view without affecting running tunnels or background services."""
        for key, btn in self.nav_buttons.items():
            if key == page_name:
                btn.configure(fg_color="#E0F2FE", text_color="#0284C7")
            else:
                btn.configure(fg_color="transparent", text_color="#64748B")

        for key, page in self.pages.items():
            if key == page_name:
                page.pack(fill="both", expand=True)
            else:
                page.pack_forget()

    # =========================================================================
    # Page 1: Tunnel Setup (Full 2-Column Grid View - Image 1)
    # =========================================================================
    def _build_setup_page(self, parent):
        grid_container = ctk.CTkFrame(parent, fg_color="transparent")
        grid_container.pack(fill="both", expand=True)
        grid_container.grid_columnconfigure(0, weight=5)
        grid_container.grid_columnconfigure(1, weight=5)
        grid_container.grid_rowconfigure(0, weight=1)

        # Left Column: Tunnel Settings Card
        left_card = ctk.CTkFrame(grid_container, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=16)
        left_card.grid(row=0, column=0, sticky="nsew", padx=(0, 10))

        self._build_control_panel(left_card)

        # Right Column: Share Your App Card
        right_card = ctk.CTkFrame(grid_container, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=16)
        right_card.grid(row=0, column=1, sticky="nsew", padx=(10, 0))

        self._build_url_card(right_card)

    def _build_control_panel(self, parent):
        """Controls section for ports, target mode, and connection engine using dropdowns."""
        self.ENGINE_MAP = {
            "Auto High-Speed (Recommended)": "cloudflare",
            "Auto High-Speed": "cloudflare",
            "Fast Direct": "localhost_run",
            "Secure Line": "serveo"
        }
        self.ENGINE_REVERSE = {
            "cloudflare": "Auto High-Speed (Recommended)",
            "localhost_run": "Fast Direct",
            "serveo": "Secure Line"
        }

        # Header Title with Circle Badge Icon
        header_box = ctk.CTkFrame(parent, fg_color="transparent")
        header_box.pack(fill="x", padx=20, pady=(20, 12))

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

        # Target Mode Segmented Buttons (Inline, zero popups)
        ctk.CTkLabel(
            parent,
            text="Target Mode",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", padx=20, pady=(8, 4))

        self.target_mode_var = ctk.StringVar(value="Full-Stack (One URL)")
        self.target_mode_seg = ctk.CTkSegmentedButton(
            parent,
            values=["Full-Stack (One URL)", "Frontend Only", "Backend Only"],
            variable=self.target_mode_var,
            command=self._on_target_mode_changed,
            selected_color="#4C8DFF",
            selected_hover_color="#3B7EFA",
            unselected_color="#F1F5F9",
            unselected_hover_color="#E2E8F0",
            text_color="#0F172A",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            corner_radius=10,
            height=36,
            bg_color="#FFFFFF"
        )
        self.target_mode_seg.pack(fill="x", padx=20, pady=(0, 10))

        # Ports Container Row (Side-by-Side 2-Column Layout)
        self.ports_row = ctk.CTkFrame(parent, fg_color="transparent")
        self.ports_row.pack(fill="x", padx=20, pady=(0, 10))
        self.ports_row.grid_columnconfigure(0, weight=1)
        self.ports_row.grid_columnconfigure(1, weight=1)

        # Left Column: Frontend Port
        self.fe_container = ctk.CTkFrame(self.ports_row, fg_color="transparent")
        self.fe_container.grid(row=0, column=0, sticky="nsew", padx=(0, 6))

        ctk.CTkLabel(
            self.fe_container,
            text="Frontend Port",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", pady=(0, 4))

        self.fe_port_combo = ctk.CTkComboBox(
            self.fe_container,
            values=["3000", "5173", "5000", "8000", "4000", "8080", "9000"],
            fg_color="#FFFFFF",
            bg_color="#FFFFFF",
            border_color="#CBD5E1",
            border_width=1,
            button_color="#F8FAFC",
            button_hover_color="#E2E8F0",
            text_color="#0F172A",
            dropdown_fg_color="#FFFFFF",
            dropdown_hover_color="#E0F2FE",
            dropdown_text_color="#0F172A",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            dropdown_font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            corner_radius=10,
            height=36
        )
        self.fe_port_combo.set(str(self.config_manager.get("last_used_port", 3000)))
        self.fe_port_combo.pack(fill="x")

        # Right Column: Backend Port
        self.be_container = ctk.CTkFrame(self.ports_row, fg_color="transparent")
        self.be_container.grid(row=0, column=1, sticky="nsew", padx=(6, 0))

        ctk.CTkLabel(
            self.be_container,
            text="Backend Port",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", pady=(0, 4))

        self.be_port_combo = ctk.CTkComboBox(
            self.be_container,
            values=["8000", "5000", "8080", "4000", "3000", "5173", "9000"],
            fg_color="#FFFFFF",
            bg_color="#FFFFFF",
            border_color="#CBD5E1",
            border_width=1,
            button_color="#F8FAFC",
            button_hover_color="#E2E8F0",
            text_color="#0F172A",
            dropdown_fg_color="#FFFFFF",
            dropdown_hover_color="#E0F2FE",
            dropdown_text_color="#0F172A",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            dropdown_font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            corner_radius=10,
            height=36
        )
        self.be_port_combo.set("8000")
        self.be_port_combo.pack(fill="x")

        # Connection Engine Segmented Buttons
        ctk.CTkLabel(
            parent,
            text="Connection Engine",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155"
        ).pack(anchor="w", padx=20, pady=(4, 4))

        saved_provider = self.config_manager.get("default_engine", "cloudflare")
        initial_label = self.ENGINE_REVERSE.get(saved_provider, "Auto High-Speed (Recommended)")

        self.provider_var = ctk.StringVar(value=initial_label)
        self.provider_seg = ctk.CTkSegmentedButton(
            parent,
            values=["Auto High-Speed (Recommended)", "Fast Direct", "Secure Line"],
            variable=self.provider_var,
            selected_color="#4C8DFF",
            selected_hover_color="#3B7EFA",
            unselected_color="#F1F5F9",
            unselected_hover_color="#E2E8F0",
            text_color="#0F172A",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            corner_radius=10,
            height=36,
            bg_color="#FFFFFF"
        )
        self.provider_seg.pack(fill="x", padx=20, pady=(0, 10))

        # Inspector Switch
        self.inspector_var = tk.BooleanVar(value=self.config_manager.get("enable_inspector", True))
        self.inspector_chk = ctk.CTkSwitch(
            parent,
            text="Enable Live HTTP Traffic Inspector",
            variable=self.inspector_var,
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#334155",
            progress_color="#4C8DFF",
            button_color="#FFFFFF",
            button_hover_color="#F1F5F9",
            bg_color="#FFFFFF"
        )
        self.inspector_chk.pack(anchor="w", padx=20, pady=(2, 10))

        # Guide Banner Box
        guide_box = ctk.CTkFrame(parent, fg_color="#FEF3C7", bg_color="#FFFFFF", corner_radius=12, border_color="#FCD34D", border_width=1)
        guide_box.pack(fill="x", padx=20, pady=(0, 10))

        guide_lbl = ctk.CTkLabel(
            guide_box,
            text="⚠️ Make sure to run your local servers on selected ports. If not, start your servers and start a new tunnel.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=11, weight="bold"),
            text_color="#92400E",
            justify="left",
            wraplength=380
        )
        guide_lbl.pack(padx=14, pady=8)

        # Big Primary Action Button
        self.action_btn = ctk.CTkButton(
            parent,
            text="Start Tunnel",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=15, weight="bold"),
            fg_color="#70A6FF",
            hover_color="#4C8DFF",
            text_color="#FFFFFF",
            height=44,
            corner_radius=12,
            bg_color="#FFFFFF",
            command=self._toggle_tunnel
        )
        self.action_btn.pack(fill="x", padx=20, pady=(0, 14))

        # Security & Trust Panel
        security_card = ctk.CTkFrame(parent, fg_color="#EFF6FF", bg_color="#FFFFFF", border_color="#BFDBFE", border_width=1, corner_radius=12)
        security_card.pack(fill="both", expand=True, padx=20, pady=(0, 16))

        ctk.CTkLabel(
            security_card,
            text="🛡️ 100% Code & Data Safe, Protected & Fully Encrypted",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
            text_color="#1E40AF"
        ).pack(anchor="w", padx=16, pady=(12, 8))

        sec_box = ctk.CTkFrame(security_card, fg_color="#FFFFFF", bg_color="#EFF6FF", border_color="#DBEAFE", border_width=1, corner_radius=8)
        sec_box.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        security_guarantees = [
            ("💻 100% Code & Data Safety", "Your source code, local files, and database stay exclusively on your computer. Zero code uploads."),
            ("🛡️ Private & Protected Gateway", "Temporary tunnel connections generated on-demand with zero tracking or remote data storage.")
        ]

        for title, desc in security_guarantees:
            row_item = ctk.CTkFrame(sec_box, fg_color="transparent")
            row_item.pack(fill="x", padx=12, pady=10)

            ctk.CTkLabel(
                row_item,
                text=title,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
                text_color="#0F172A",
                anchor="w"
            ).pack(anchor="w")

            ctk.CTkLabel(
                row_item,
                text=desc,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=11),
                text_color="#475569",
                anchor="w",
                justify="left",
                wraplength=380
            ).pack(anchor="w", pady=(2, 0))

    def _on_target_mode_changed(self, value: str):
        if "Full-Stack" in value:
            self.fe_container.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
            self.be_container.grid(row=0, column=1, sticky="nsew", padx=(6, 0))
        elif "Frontend" in value:
            self.fe_container.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=0)
            self.be_container.grid_forget()
        elif "Backend" in value:
            self.fe_container.grid_forget()
            self.be_container.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=0)

    def _build_url_card(self, parent):
        """Card showing active public HTTPS URL and QR Code."""
        # Header Title with Circle Share Icon Badge
        header_box = ctk.CTkFrame(parent, fg_color="transparent")
        header_box.pack(fill="x", padx=20, pady=(20, 16))

        icon_badge = ctk.CTkLabel(
            header_box,
            text="🔗",
            font=ctk.CTkFont(size=20),
            fg_color="#EBF3FE",
            width=46,
            height=46,
            corner_radius=23
        )
        icon_badge.pack(side="left", padx=(0, 14))

        title_box = ctk.CTkFrame(header_box, fg_color="transparent")
        title_box.pack(side="left", fill="both", expand=True)

        ctk.CTkLabel(
            title_box,
            text="Share Your App",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=20, weight="bold"),
            text_color="#0F172A",
            anchor="w"
        ).pack(anchor="w")

        ctk.CTkLabel(
            title_box,
            text="Your public link is ready to use.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#64748B",
            anchor="w"
        ).pack(anchor="w", pady=(2, 0))

        # Public Link Box
        fe_row = ctk.CTkFrame(parent, fg_color="#F8FAFC", border_color="#E2E8F0", border_width=1, corner_radius=12)
        fe_row.pack(fill="x", padx=20, pady=(0, 12))

        link_icon = ctk.CTkLabel(fe_row, text="🔗", font=ctk.CTkFont(size=14))
        link_icon.pack(side="left", padx=(12, 6))

        self.url_label = ctk.CTkEntry(
            fe_row,
            placeholder_text="https://waiting-for-tunnel...",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            fg_color="transparent",
            border_width=0,
            text_color="#0F172A"
        )
        self.url_label.pack(side="left", fill="x", expand=True, padx=4, pady=8)

        self.copy_btn = ctk.CTkButton(
            fe_row,
            text="📋 Copy",
            width=80,
            height=34,
            fg_color="#E0F2FE",
            hover_color="#BAE6FD",
            text_color="#0284C7",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            corner_radius=8,
            command=self._copy_url
        )
        self.copy_btn.pack(side="right", padx=6, pady=6)

        self.open_btn = ctk.CTkButton(
            parent,
            text="🌐 Open in Browser",
            height=42,
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
            corner_radius=12,
            command=self._open_url
        )
        self.open_btn.pack(fill="x", padx=20, pady=(0, 6))

        self.link_verified_label = ctk.CTkLabel(
            parent,
            text="",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#166534"
        )
        self.link_verified_label.pack(pady=(0, 4))
        # Retry & Server Notice Box above QR code
        qr_notice_card = ctk.CTkFrame(parent, fg_color="#EFF6FF", border_color="#BFDBFE", border_width=1, corner_radius=12)
        qr_notice_card.pack(fill="x", padx=20, pady=(0, 10))

        ctk.CTkLabel(
            qr_notice_card,
            text="🔄 If site is not loading, try generating a new URL.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            text_color="#1E40AF"
        ).pack(anchor="w", padx=12, pady=(8, 2))

        ctk.CTkLabel(
            qr_notice_card,
            text="⚠️ Make sure to run your local servers on selected ports. If not, start your servers and start a new tunnel.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=11),
            text_color="#1E3A8A",
            justify="left",
            wraplength=380
        ).pack(anchor="w", padx=12, pady=(0, 4))

        ctk.CTkLabel(
            qr_notice_card,
            text="💤 Note: Do not click sleep or shutdown on your computer while using the active tunnel.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=11, weight="bold"),
            text_color="#1E40AF",
            justify="left",
            wraplength=380
        ).pack(anchor="w", padx=12, pady=(0, 8))

        # Large Centered QR Code Container Box
        qr_outer = ctk.CTkFrame(parent, fg_color="#F8FAFC", border_color="#E2E8F0", border_width=1, corner_radius=16)
        qr_outer.pack(fill="both", expand=True, padx=20, pady=(0, 20))

        qr_inner_card = ctk.CTkFrame(qr_outer, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=16)
        qr_inner_card.pack(expand=True, padx=16, pady=16)

        self.qr_label = ctk.CTkLabel(qr_inner_card, text="[ Mobile QR Code Preview ]", text_color="#94A3B8")
        self.qr_label.pack(padx=14, pady=14)

        ctk.CTkLabel(
            qr_outer,
            text="📱 Scan to open on any device",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#64748B"
        ).pack(pady=(0, 16))

    # =========================================================================
    # Page 2: Traffic Inspector Page (Full-Width Page - Image 2)
    # =========================================================================
    def _build_inspector_page(self, parent):
        card = ctk.CTkFrame(parent, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=16)
        card.pack(fill="both", expand=True)

        toolbar = ctk.CTkFrame(card, fg_color="transparent")
        toolbar.pack(fill="x", padx=24, pady=(20, 12))

        ctk.CTkLabel(
            toolbar,
            text="Live Incoming Requests",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A"
        ).pack(side="left")

        clear_btn = ctk.CTkButton(
            toolbar,
            text="🗑️ Clear Logs",
            width=100,
            height=32,
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

        # Empty State Container (shown when 0 requests logged - Image 2)
        self.empty_state_frame = ctk.CTkFrame(card, fg_color="transparent")
        self.empty_state_frame.pack(fill="both", expand=True, padx=24, pady=30)

        empty_box = ctk.CTkFrame(self.empty_state_frame, fg_color="#F8FAFC", corner_radius=16)
        empty_box.pack(expand=True, padx=40, pady=20, fill="both")

        ctk.CTkLabel(
            empty_box,
            text="📊",
            font=ctk.CTkFont(size=44)
        ).pack(pady=(40, 10))

        ctk.CTkLabel(
            empty_box,
            text="No requests yet",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A"
        ).pack(pady=(0, 4))

        ctk.CTkLabel(
            empty_box,
            text="We'll show incoming requests here as they arrive.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#64748B"
        ).pack(pady=(0, 40))

        # Requests Table View (hidden initially until requests arrive)
        self.table_frame = ctk.CTkFrame(card, fg_color="transparent")

        style = ttk.Style()
        style.theme_use("default")
        style.configure(
            "Treeview",
            background="#FFFFFF",
            foreground="#0F172A",
            fieldbackground="#FFFFFF",
            rowheight=32,
            font=("Segoe UI", 11)
        )
        style.configure("Treeview.Heading", background="#F8FAFC", foreground="#475569", font=("Plus Jakarta Sans", 11, "bold"), relief="flat")
        style.map("Treeview", background=[("selected", "#E0F2FE")], foreground=[("selected", "#0F172A")])

        columns = ("time", "method", "path", "status", "duration", "size")
        self.inspector_tree = ttk.Treeview(self.table_frame, columns=columns, show="headings", selectmode="browse")

        self.inspector_tree.heading("time", text="Time ↕")
        self.inspector_tree.heading("method", text="Method ↕")
        self.inspector_tree.heading("path", text="Path ↕")
        self.inspector_tree.heading("status", text="Status ↕")
        self.inspector_tree.heading("duration", text="Duration ↕")
        self.inspector_tree.heading("size", text="Size")

        self.inspector_tree.column("time", width=120, anchor="center")
        self.inspector_tree.column("method", width=100, anchor="center")
        self.inspector_tree.column("path", width=340, anchor="w")
        self.inspector_tree.column("status", width=100, anchor="center")
        self.inspector_tree.column("duration", width=110, anchor="center")
        self.inspector_tree.column("size", width=100, anchor="center")

        scrollbar = ttk.Scrollbar(self.table_frame, orient="vertical", command=self.inspector_tree.yview)
        self.inspector_tree.configure(yscrollcommand=scrollbar.set)

        self.inspector_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

    # =========================================================================
    # Page 3: Saved Profiles Page
    # =========================================================================
    def _build_profiles_page(self, parent):
        card = ctk.CTkFrame(parent, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=16)
        card.pack(fill="both", expand=True, padx=0, pady=0)

        ctk.CTkLabel(
            card,
            text="Saved Port & URL Profiles",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A"
        ).pack(anchor="w", padx=24, pady=(20, 12))

        self.profiles_frame = ctk.CTkScrollableFrame(card, fg_color="#F8FAFC", corner_radius=12)
        self.profiles_frame.pack(fill="both", expand=True, padx=24, pady=(0, 24))

        self._refresh_profiles_list()

    def _refresh_profiles_list(self):
        for widget in self.profiles_frame.winfo_children():
            widget.destroy()

        profiles = self.config_manager.get("saved_profiles", [])
        if not profiles:
            ctk.CTkLabel(
                self.profiles_frame,
                text="No saved profiles yet. Custom profiles will appear here for 1-click loading.",
                font=ctk.CTkFont(size=13),
                text_color="#94A3B8"
            ).pack(pady=40)
            return

        for p in profiles:
            p_card = ctk.CTkFrame(self.profiles_frame, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=10)
            p_card.pack(fill="x", padx=8, pady=6)

            info_str = f"📌 {p.get('name')}  |  Port: {p.get('port')}  |  Subdomain: {p.get('subdomain')}"
            ctk.CTkLabel(
                p_card,
                text=info_str,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
                text_color="#0F172A"
            ).pack(side="left", padx=14, pady=12)

            btn = ctk.CTkButton(
                p_card,
                text="Load Profile",
                width=100,
                height=32,
                fg_color="#4C8DFF",
                hover_color="#3B7EFA",
                text_color="#FFFFFF",
                font=ctk.CTkFont(size=12, weight="bold"),
                corner_radius=8,
                command=lambda prof=p: self._load_profile(prof)
            )
            btn.pack(side="right", padx=14)

    def _load_profile(self, profile: dict):
        fe_p = str(profile.get("port", 3000))
        if hasattr(self, 'fe_port_combo'):
            self.fe_port_combo.set(fe_p)

        be_p = str(profile.get("backend_port", 8000))
        if hasattr(self, 'be_port_combo'):
            self.be_port_combo.set(be_p)

        self._switch_page("setup")
        self._log_terminal(f"[Share Port] Loaded profile '{profile.get('name')}'.")

    # =========================================================================
    # Page 4: About & Developer Trust Guide Page
    # =========================================================================
    def _build_about_page(self, parent):
        card = ctk.CTkFrame(parent, fg_color="transparent")
        card.pack(fill="both", expand=True, padx=0, pady=0)

        # Header Title + Subtitle
        header_frame = ctk.CTkFrame(card, fg_color="transparent")
        header_frame.pack(fill="x", padx=10, pady=(10, 12))

        ctk.CTkLabel(
            header_frame,
            text="About Share Port",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=26, weight="bold"),
            text_color="#0F172A"
        ).pack(anchor="w")

        ctk.CTkLabel(
            header_frame,
            text="Everything you need to know — simple and clear.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=14),
            text_color="#64748B"
        ).pack(anchor="w", pady=(2, 0))

        # Main Scrollable Body Container
        scroll_container = ctk.CTkScrollableFrame(card, fg_color="transparent")
        scroll_container.pack(fill="both", expand=True, padx=0, pady=0)

        # ---------------------------------------------------------------------
        # Prominent Security & Trust Banner (Code & Data Safe, Fully Encrypted)
        # ---------------------------------------------------------------------
        trust_banner = ctk.CTkFrame(
            scroll_container,
            fg_color="#EFF6FF",
            border_color="#BFDBFE",
            border_width=1,
            corner_radius=16
        )
        trust_banner.pack(fill="x", pady=(0, 16))

        tb_inner = ctk.CTkFrame(trust_banner, fg_color="transparent")
        tb_inner.pack(fill="x", padx=20, pady=16)

        # Top Section: Shield Circle Icon + Text
        tb_top_row = ctk.CTkFrame(tb_inner, fg_color="transparent")
        tb_top_row.pack(fill="x")

        # Left Perfect Circle Badge (Direct CTkLabel for clean circle without canvas clipping)
        icon_circle = ctk.CTkLabel(
            tb_top_row,
            text="🛡️",
            font=ctk.CTkFont(size=22),
            fg_color="#DBEAFE",
            width=48,
            height=48,
            corner_radius=24
        )
        icon_circle.pack(side="left", padx=(0, 14), anchor="n")

        # Text Information Box
        tb_text_box = ctk.CTkFrame(tb_top_row, fg_color="transparent")
        tb_text_box.pack(side="left", fill="both", expand=True)

        ctk.CTkLabel(
            tb_text_box,
            text="🔒 100% Safe, Private & Fully Encrypted",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=17, weight="bold"),
            text_color="#1E40AF",
            anchor="w"
        ).pack(anchor="w")

        ctk.CTkLabel(
            tb_text_box,
            text="Your source code, local files, and data are 100% safe and stay exclusively on your computer. All tunnel traffic is secured with end-to-end HTTPS / TLS encryption.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#1E3A8A",
            anchor="w",
            justify="left",
            wraplength=650
        ).pack(anchor="w", pady=(3, 0))

        # Bottom Section: Horizontal Row of Badges
        badges_row = ctk.CTkFrame(tb_inner, fg_color="transparent")
        badges_row.pack(fill="x", pady=(12, 0))

        badges = [
            ("💻 Source Code & Data Safe", "#FFFFFF", "#1E40AF", "#BFDBFE"),
            ("🔒 Everything Fully Encrypted", "#FFFFFF", "#0369A1", "#BAE6FD"),
            ("⚡ 100% Local Execution", "#FFFFFF", "#6B21A8", "#DDD6FE")
        ]

        for b_text, b_bg, b_fg, b_border in badges:
            b_lbl = ctk.CTkLabel(
                badges_row,
                text=b_text,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=11, weight="bold"),
                text_color=b_fg,
                fg_color=b_bg,
                border_color=b_border,
                border_width=1,
                corner_radius=12,
                padx=12,
                pady=4
            )
            b_lbl.pack(side="left", padx=(0, 10))

        # ---------------------------------------------------------------------
        # Top 3 Horizontal Cards (Increased fonts & single-line points)
        # ---------------------------------------------------------------------
        grid_frame = ctk.CTkFrame(scroll_container, fg_color="transparent")
        grid_frame.pack(fill="x", expand=True, pady=(0, 20))
        grid_frame.grid_columnconfigure(0, weight=1)
        grid_frame.grid_columnconfigure(1, weight=1)
        grid_frame.grid_columnconfigure(2, weight=1)

        cards_data = [
            {
                "accent": "#0EA5E9",
                "icon_bg": "#E0F2FE",
                "icon": "💎",
                "title": "100% Free Forever",
                "intro": "Completely free for everyone with zero paywalls.",
                "bullets": [
                    "• No credit card, payment, or subscription required",
                    "• No bandwidth caps, duration limits, or hidden fees",
                    "• Unlimited local tunneling for personal & team projects"
                ]
            },
            {
                "accent": "#2563EB",
                "icon_bg": "#DBEAFE",
                "icon": "🚀",
                "title": "Perfect for Sharing & Testing",
                "intro": "Easily expose your local app to the public internet.",
                "bullets": [
                    "• Instant HTTPS link generation for any localhost port",
                    "• Works seamlessly for React, Next, Vue, Python & Node",
                    "• Ideal for client demos, mobile previews & webhooks"
                ]
            },
            {
                "accent": "#9333EA",
                "icon_bg": "#F3E8FF",
                "icon": "🛡️",
                "title": "Safe & Private",
                "intro": "Your code and data never leave your computer.",
                "bullets": [
                    "• Local files & databases remain 100% safe and isolated",
                    "• Creates encrypted temporary tunnels on-demand",
                    "• Browser security warnings on first visit are normal"
                ]
            }
        ]

        for idx, item in enumerate(cards_data):
            c_frame = ctk.CTkFrame(
                grid_frame,
                fg_color="#FFFFFF",
                border_color="#E2E8F0",
                border_width=1,
                corner_radius=16
            )
            padx_setting = (0, 8) if idx == 0 else ((8, 8) if idx == 1 else (8, 0))
            c_frame.grid(row=0, column=idx, sticky="nsew", padx=padx_setting, pady=4)

            # Left vertical colored accent strip
            accent_bar = ctk.CTkFrame(c_frame, fg_color=item["accent"], width=5, corner_radius=3)
            accent_bar.pack(side="left", fill="y", padx=(2, 0), pady=6)

            content_box = ctk.CTkFrame(c_frame, fg_color="transparent")
            content_box.pack(side="left", fill="both", expand=True, padx=18, pady=20)

            # Circular Icon Badge (Direct CTkLabel for clean circle)
            icon_badge = ctk.CTkLabel(
                content_box,
                text=item["icon"],
                font=ctk.CTkFont(size=24),
                fg_color=item["icon_bg"],
                width=52,
                height=52,
                corner_radius=26
            )
            icon_badge.pack(anchor="w", pady=(0, 14))

            # Title
            t_lbl = ctk.CTkLabel(
                content_box,
                text=item["title"],
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=19, weight="bold"),
                text_color="#0F172A",
                anchor="w",
                justify="left"
            )
            t_lbl.pack(anchor="w", fill="x", pady=(0, 6))

            # Intro text
            intro_lbl = ctk.CTkLabel(
                content_box,
                text=item["intro"],
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
                text_color="#334155",
                anchor="w",
                justify="left",
                wraplength=280
            )
            intro_lbl.pack(anchor="w", fill="x", pady=(0, 10))

            # Single-line Bullet Points
            for bullet in item["bullets"]:
                bullet_lbl = ctk.CTkLabel(
                    content_box,
                    text=bullet,
                    font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
                    text_color="#475569",
                    anchor="w",
                    justify="left",
                    wraplength=280
                )
                bullet_lbl.pack(anchor="w", fill="x", pady=(3, 0))

        # ---------------------------------------------------------------------
        # Application Features Panel at Bottom (Fills bottom gap modernly)
        # ---------------------------------------------------------------------
        features_card = ctk.CTkFrame(
            scroll_container,
            fg_color="#FFFFFF",
            border_color="#CBD5E1",
            border_width=1,
            corner_radius=16
        )
        features_card.pack(fill="x", pady=(0, 16))

        feat_header = ctk.CTkFrame(features_card, fg_color="transparent")
        feat_header.pack(fill="x", padx=20, pady=(16, 12))

        ctk.CTkLabel(
            feat_header,
            text="⚡ Share Port Core Application Features",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A"
        ).pack(anchor="w")

        ctk.CTkLabel(
            feat_header,
            text="Everything included out-of-the-box in your local developer tunneling toolkit.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13),
            text_color="#64748B"
        ).pack(anchor="w", pady=(2, 0))

        # Grid of 4 Feature Cards (2x2 Grid)
        feat_grid = ctk.CTkFrame(features_card, fg_color="transparent")
        feat_grid.pack(fill="x", padx=16, pady=(0, 18))
        feat_grid.grid_columnconfigure(0, weight=1)
        feat_grid.grid_columnconfigure(1, weight=1)

        features_list = [
            ("⚡", "#EFF6FF", "#2563EB", "1-Click Public HTTPS Tunneling", "Generates an instant public HTTPS web link for your local server (ports 3000, 5173, 8000, 8080) with automatic SSL certificate encryption."),
            ("📱", "#F0F9FF", "#0284C7", "Instant Mobile QR Code Preview", "Scan the live generated QR code with any smartphone camera to test and preview your local web app on real mobile devices."),
            ("🔍", "#FFF7ED", "#EA580C", "Live HTTP Traffic Inspector", "Real-time detailed inspection of incoming requests, headers, query parameters, response status codes, and execution latency."),
            ("🌐", "#F3E8FF", "#9333EA", "Unified Full-Stack Port Forwarding", "Automatically route both Frontend UI (e.g., React/Vite) and Backend API (e.g., Node/FastAPI) together through one single public URL.")
        ]

        for i, (f_icon, f_bg, f_color, f_title, f_desc) in enumerate(features_list):
            row = i // 2
            col = i % 2

            f_box = ctk.CTkFrame(
                feat_grid,
                fg_color="#F8FAFC",
                border_color="#E2E8F0",
                border_width=1,
                corner_radius=12
            )
            f_box.grid(row=row, column=col, sticky="nsew", padx=6, pady=6)

            f_inner = ctk.CTkFrame(f_box, fg_color="transparent")
            f_inner.pack(fill="both", expand=True, padx=14, pady=12)

            f_icon_lbl = ctk.CTkLabel(
                f_inner,
                text=f_icon,
                font=ctk.CTkFont(size=20),
                fg_color=f_bg,
                width=42,
                height=42,
                corner_radius=21
            )
            f_icon_lbl.pack(side="left", padx=(0, 12), anchor="n")

            f_text_box = ctk.CTkFrame(f_inner, fg_color="transparent")
            f_text_box.pack(side="left", fill="both", expand=True)

            ctk.CTkLabel(
                f_text_box,
                text=f_title,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=14, weight="bold"),
                text_color="#0F172A",
                anchor="w"
            ).pack(anchor="w")

            ctk.CTkLabel(
                f_text_box,
                text=f_desc,
                font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
                text_color="#475569",
                anchor="w",
                justify="left",
                wraplength=380
            ).pack(anchor="w", pady=(3, 0))

        # Footer Action Bar
        footer = ctk.CTkFrame(card, fg_color="transparent")
        footer.pack(fill="x", padx=10, pady=(12, 0))

        ctk.CTkButton(
            footer,
            text="🌐 Visit Website (shareport.in)",
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            border_color="#BFDBFE",
            border_width=1,
            corner_radius=8,
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            command=lambda: webbrowser.open("https://www.shareport.in"),
            height=36
        ).pack(side="left")

        ctk.CTkButton(
            footer,
            text="🚀 Start Tunnel Now",
            fg_color="#4C8DFF",
            hover_color="#3B7EFA",
            text_color="#FFFFFF",
            corner_radius=8,
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            command=lambda: self._switch_page("setup"),
            height=36
        ).pack(side="right")

    # =========================================================================
    # Page 5: Tunnel Terminal Console Page
    # =========================================================================
    def _build_terminal_page(self, parent):
        card = ctk.CTkFrame(parent, fg_color="#FFFFFF", border_color="#E2E8F0", border_width=1, corner_radius=16)
        card.pack(fill="both", expand=True)

        ctk.CTkLabel(
            card,
            text="Raw Gateway Engine Logs",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=18, weight="bold"),
            text_color="#0F172A"
        ).pack(anchor="w", padx=24, pady=(20, 12))

        self.terminal_text = ctk.CTkTextbox(
            card,
            font=ctk.CTkFont(family="Consolas", size=11),
            fg_color="#0F172A",
            text_color="#38BDF8",
            corner_radius=12
        )
        self.terminal_text.pack(fill="both", expand=True, padx=24, pady=(0, 24))

    def _log_terminal(self, msg: str):
        if hasattr(self, 'terminal_text'):
            self.terminal_text.insert("end", f"{msg}\n")
            self.terminal_text.see("end")

    # =========================================================================
    # Event Handlers & Core Functions
    # =========================================================================
    def _get_frontend_port(self) -> int:
        val = self.fe_port_combo.get().strip() if hasattr(self, 'fe_port_combo') else "3000"
        try:
            return int(val) if val else 3000
        except ValueError:
            return 3000

    def _get_backend_port(self) -> int:
        val = self.be_port_combo.get().strip() if hasattr(self, 'be_port_combo') else "8000"
        try:
            return int(val) if val else 8000
        except ValueError:
            return 8000

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

        if "Full-Stack" in target_mode:
            if backend_port == port:
                backend_port = 8000 if port != 8000 else 8001
            enable_fullstack = True
        elif "Frontend" in target_mode:
            enable_fullstack = False
            backend_port = 0
        else:  # Backend Only
            port = backend_port
            enable_fullstack = False
            backend_port = 0

        mode = "random"
        subdomain = ""

        ui_engine = self.provider_var.get()
        provider = self.ENGINE_MAP.get(ui_engine, "localhost_run")
        enable_inspector = self.inspector_var.get()

        # Save preferences
        self.config_manager.set("last_used_port", port)
        self.config_manager.set("default_engine", provider)

        # Update UI to Connecting (Distinct Warm Amber/Orange #EA580C for instant visual identification)
        self.action_btn.configure(text="⚡ Generating Public URL... Please Wait", fg_color="#EA580C", hover_color="#C2410C")
        self.status_badge.configure(text="● ⚡ CONNECTING...", text_color="#C2410C", fg_color="#FFEDD5")
        self.url_label.delete(0, tk.END)
        self.url_label.insert(0, "⚡ Generating live HTTPS public URL... Please wait")

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
        if getattr(self, '_is_stopping', False):
            return
        self._is_stopping = True

        self.action_btn.configure(text="⏳ Stopping Tunnel... Please Wait", fg_color="#EA580C", hover_color="#C2410C", state="disabled")
        self.status_badge.configure(text="● STOPPING...", text_color="#C2410C", fg_color="#FFEDD5")

        def _do_stop():
            if self.engine:
                try:
                    self.engine.stop()
                except Exception as e:
                    print(f"[SHARE PORT Stop Error] {e}")
                self.engine = None
            self.after(0, self._on_tunnel_stopped_ui)

        threading.Thread(target=_do_stop, daemon=True).start()

    def _on_tunnel_stopped_ui(self):
        self._is_stopping = False
        self.action_btn.configure(text="Start Tunnel", fg_color="#70A6FF", hover_color="#4C8DFF", state="normal")
        self.status_badge.configure(text="● DISCONNECTED", text_color="#991B1B", fg_color="#FEE2E2")
        self.url_label.delete(0, tk.END)
        self.url_label.insert(0, "")
        if hasattr(self, 'link_verified_label'):
            self.link_verified_label.configure(text="")

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
            self.status_badge.configure(text="● LIVE ONLINE", text_color="#166534", fg_color="#DCFCE7")
            self.url_label.delete(0, tk.END)
            self.url_label.insert(0, url)
            if hasattr(self, 'link_verified_label'):
                self.link_verified_label.configure(text="✓ Public HTTPS Tunnel Verified & Active (200 OK)", text_color="#166534")
            self._log_terminal(f"[SUCCESS] Public HTTPS URL: {url}")

            try:
                qr_pil = generate_image_qr(url, size=190)
                qr_ctk = ctk.CTkImage(light_image=qr_pil, dark_image=qr_pil, size=(190, 190))
                self.qr_label.configure(image=qr_ctk, text="")
            except Exception as e:
                print(f"QR Error: {e}")

            if self.config_manager.get("auto_copy_url", True):
                self._copy_url()

        elif status == "ERROR":
            self.status_badge.configure(text="● ERROR", text_color="#991B1B", fg_color="#FEE2E2")
            self.url_label.delete(0, tk.END)
            self.url_label.insert(0, "Error starting tunnel")
            self._log_terminal(f"[ERROR] {error}")
            self._stop_tunnel()

    def _on_request_log(self, req: RequestLog):
        self.after(0, lambda: self._add_inspector_row(req))

    def _add_inspector_row(self, req: RequestLog):
        if hasattr(self, 'empty_state_frame') and self.empty_state_frame.winfo_ismapped():
            self.empty_state_frame.pack_forget()
            self.table_frame.pack(fill="both", expand=True, padx=24, pady=(0, 24))

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
        if hasattr(self, 'table_frame') and hasattr(self, 'empty_state_frame'):
            self.table_frame.pack_forget()
            self.empty_state_frame.pack(fill="both", expand=True, padx=24, pady=30)

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

    def _open_help_dialog(self):
        """Opens Help, Trust Notice & R&D Developer Guide dialog."""
        dialog = ctk.CTkToplevel(self)
        dialog.title("Share Port - Developer & Trust Guide")
        dialog.geometry("520x480")
        dialog.resizable(False, False)
        dialog.configure(fg_color="#FFFFFF")
        dialog.grab_set()

        ctk.CTkLabel(
            dialog,
            text="❓ Help & Trust Notice",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=20, weight="bold"),
            text_color="#0F172A"
        ).pack(pady=(20, 4))

        ctk.CTkLabel(
            dialog,
            text="Everything you need to know about Share Port.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12),
            text_color="#64748B"
        ).pack(pady=(0, 12))

        scroll_card = ctk.CTkScrollableFrame(dialog, fg_color="#F8FAFC", border_color="#E2E8F0", border_width=1, corner_radius=12)
        scroll_card.pack(fill="both", expand=True, padx=20, pady=(0, 16))

        # 1. 100% Free Section
        ctk.CTkLabel(
            scroll_card,
            text="💚 100% Free for Everyone",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
            text_color="#0F172A",
            anchor="w"
        ).pack(anchor="w", padx=12, pady=(12, 4))

        ctk.CTkLabel(
            scroll_card,
            text="Share Port is completely free to use for developers, students, educators, and organizations to test and share local projects effortlessly.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=11),
            text_color="#334155",
            justify="left",
            wraplength=440
        ).pack(anchor="w", padx=12, pady=(0, 10))

        # 2. R&D Purpose Section
        ctk.CTkLabel(
            scroll_card,
            text="🧪 Research & Development (R&D) Purpose",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
            text_color="#0F172A",
            anchor="w"
        ).pack(anchor="w", padx=12, pady=(4, 4))

        ctk.CTkLabel(
            scroll_card,
            text="Share Port is an R&D utility intended specifically for temporary development testing, quick previews, and peer sharing as needed.",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=11),
            text_color="#334155",
            justify="left",
            wraplength=440
        ).pack(anchor="w", padx=12, pady=(0, 10))

        # 3. Security Warning Reassurance Section
        ctk.CTkLabel(
            scroll_card,
            text="🔒 Temporary Link Notice & Security Reassurance",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=13, weight="bold"),
            text_color="#0F172A",
            anchor="w"
        ).pack(anchor="w", padx=12, pady=(4, 4))

        reassurance_text = (
            "Because Share Port generates temporary public testing URLs dynamically, some web browsers "
            "or security tools may display standard temporary notice badges (such as 'Not Secure' or 'Unverified Site').\n\n"
            "• Why this happens: Automated temporary subdomains don't carry permanent static SSL certificates.\n"
            "• Zero Risk: Your local computer, source code, and project files remain 100% safe, isolated, and untouched."
        )

        ctk.CTkLabel(
            scroll_card,
            text=reassurance_text,
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=11),
            text_color="#334155",
            justify="left",
            wraplength=440
        ).pack(anchor="w", padx=12, pady=(0, 14))

        # Action Buttons
        btn_frame = ctk.CTkFrame(dialog, fg_color="transparent")
        btn_frame.pack(fill="x", padx=20, pady=(0, 16))

        ctk.CTkButton(
            btn_frame,
            text="🌐 Visit Official Website",
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            command=lambda: webbrowser.open("https://www.shareport.in"),
            height=36
        ).pack(side="left")

        ctk.CTkButton(
            btn_frame,
            text="Close",
            fg_color="#4C8DFF",
            hover_color="#3B7EFA",
            text_color="#FFFFFF",
            font=ctk.CTkFont(family="Plus Jakarta Sans", size=12, weight="bold"),
            command=dialog.destroy,
            width=100,
            height=36
        ).pack(side="right")

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
        """Opens update dialog."""
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

    def _check_access_policy(self):
        """Asynchronously checks remote access control policy."""
        status = AccessControlManager.check_access(APP_VERSION, self.config_manager)
        if status.is_restricted:
            self.after(0, lambda: self._show_access_restricted_overlay(status))

    def _show_access_restricted_overlay(self, status: AccessStatus):
        """Renders lock overlay screen blocking tunnel controls until acknowledged."""
        if hasattr(self, "overlay_frame") and self.overlay_frame.winfo_exists():
            return

        self.overlay_frame = ctk.CTkFrame(self, fg_color="rgba(244, 247, 252, 0.95)", corner_radius=16)
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

    def _on_close(self):
        if self.engine:
            self.engine.stop()
        self.destroy()
