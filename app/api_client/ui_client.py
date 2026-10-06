"""
Share Port API Client & Collection Testing UI.
User-friendly desktop API client running 100% locally with zero external server.
Includes:
1. Auto-expanding Params & Headers tables with default empty row & 2-way URL sync.
2. Complete API Testing suite (Status 200, Latency < 500ms, Body & JSON assertions).
3. Test Results tab with PASS/FAIL badges.
4. One-click "📋 cURL" export button.
5. Draggable resizable panels (Horizontal Sidebar & Vertical Request/Response splitters).
6. Swagger UI / FastAPI Docs auto-detection, browser preview, and 1-click OpenAPI endpoint generator.
7. Guaranteed visible delete buttons on long collection & request titles.
8. Zero-server collection link sharing & standard v2.1 format compatibility.
"""

import os
import re
import json
import tkinter as tk
from tkinter import messagebox, filedialog
import customtkinter as ctk
import webbrowser
import threading
from urllib.parse import urlparse, parse_qsl, urlencode, urlunsplit, urlsplit
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path

from app.api_client.engine import RequestEngine, RequestConfig, ResponseData
from app.api_client.collection_manager import CollectionManager, generate_copy_name
from app.api_client.share_service import ShareService


def get_font_family() -> str:
    import sys
    if sys.platform == "win32":
        return "Segoe UI"
    elif sys.platform == "darwin":
        return "SF Pro Display"
    return "DejaVu Sans"


APP_FONT = get_font_family()

METHOD_COLORS = {
    "GET": {"badge_bg": "#DCFCE7", "badge_text": "#16A34A", "btn_bg": "#16A34A", "btn_hover": "#15803D"},
    "POST": {"badge_bg": "#FFEDD5", "badge_text": "#EA580C", "btn_bg": "#EA580C", "btn_hover": "#C2410C"},
    "PUT": {"badge_bg": "#DBEAFE", "badge_text": "#2563EB", "btn_bg": "#2563EB", "btn_hover": "#1D4ED8"},
    "DELETE": {"badge_bg": "#FEE2E2", "badge_text": "#DC2626", "btn_bg": "#DC2626", "btn_hover": "#B91C1C"},
    "PATCH": {"badge_bg": "#F3E8FF", "badge_text": "#9333EA", "btn_bg": "#9333EA", "btn_hover": "#7E22CE"},
    "HEAD": {"badge_bg": "#F1F5F9", "badge_text": "#475569", "btn_bg": "#475569", "btn_hover": "#334155"},
    "OPTIONS": {"badge_bg": "#F1F5F9", "badge_text": "#475569", "btn_bg": "#475569", "btn_hover": "#334155"},
}


class ToolTip:
    """Lightweight, non-intrusive tooltip popup for buttons and icons."""
    def __init__(self, widget, text: str, delay_ms: int = 300):
        self.widget = widget
        self.text = text
        self.delay_ms = delay_ms
        self.tip_window = None
        self._after_id = None
        self.widget.bind("<Enter>", self._on_enter, add=True)
        self.widget.bind("<Leave>", self._on_leave, add=True)
        self.widget.bind("<Button-1>", self._on_leave, add=True)

    def _on_enter(self, event=None):
        self._cancel()
        self._after_id = self.widget.after(self.delay_ms, self._show_tip)

    def _on_leave(self, event=None):
        self._cancel()
        self._hide_tip()

    def _cancel(self):
        if self._after_id:
            try:
                self.widget.after_cancel(self._after_id)
            except Exception:
                pass
            self._after_id = None

    def _show_tip(self):
        if not self.widget.winfo_exists():
            return
        x = self.widget.winfo_rootx() + (self.widget.winfo_width() // 2)
        y = self.widget.winfo_rooty() + self.widget.winfo_height() + 5

        self.tip_window = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        try:
            tw.attributes("-topmost", True)
        except Exception:
            pass

        frame = tk.Frame(tw, background="#0F172A", padx=7, pady=3)
        frame.pack()
        label = tk.Label(
            frame,
            text=self.text,
            background="#0F172A",
            foreground="#FFFFFF",
            font=("Segoe UI", 9, "bold")
        )
        label.pack()

    def _hide_tip(self):
        if self.tip_window:
            try:
                self.tip_window.destroy()
            except Exception:
                pass
            self.tip_window = None


def add_tooltip(widget, text: str) -> ToolTip:
    return ToolTip(widget, text)


class JSONSyntaxHighlighter:
    """Highlights JSON keys, string values, numbers, and boolean/null tokens in CTkTextbox."""
    TOKEN_SPEC = [
        ('json_key',       r'\"(?:\\.|[^\"\\])*\"(?=\s*:)'),
        ('json_string',    r'\"(?:\\.|[^\"\\])*\"'),
        ('json_number',    r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?'),
        ('json_bool_null', r'\b(?:true|false|null)\b'),
    ]
    REGEX = re.compile('|'.join(f'(?P<{name}>{pattern})' for name, pattern in TOKEN_SPEC))

    @classmethod
    def setup_tags(cls, textbox: ctk.CTkTextbox):
        tb = textbox._textbox
        # Distinct JSON Colors:
        # Keys in bright blue (#0284C7), Strings in green (#16A34A),
        # Numbers in amber/orange (#D97706), Booleans/null in purple (#7C3AED)
        tb.tag_configure("json_key", foreground="#0284C7", font=("Consolas", 11, "bold"))
        tb.tag_configure("json_string", foreground="#16A34A", font=("Consolas", 11))
        tb.tag_configure("json_number", foreground="#D97706", font=("Consolas", 11))
        tb.tag_configure("json_bool_null", foreground="#7C3AED", font=("Consolas", 11, "bold"))
        # Search highlight tags
        tb.tag_configure("search_match", background="#FEF08A", foreground="#0F172A")
        tb.tag_configure("search_active", background="#F59E0B", foreground="#FFFFFF")

    @classmethod
    def highlight(cls, textbox: ctk.CTkTextbox):
        try:
            tb = textbox._textbox
            for tag_name in ("json_key", "json_string", "json_number", "json_bool_null"):
                tb.tag_remove(tag_name, "1.0", "end")

            content = tb.get("1.0", "end-1c")
            if not content or len(content) > 600000:
                return

            for match in cls.REGEX.finditer(content):
                kind = match.lastgroup
                start_idx = f"1.0+{match.start()}c"
                end_idx = f"1.0+{match.end()}c"
                tb.tag_add(kind, start_idx, end_idx)
        except Exception:
            pass


class TextSearchBar(ctk.CTkFrame):
    """Integrated search toolbar for CTkTextbox with instant find, match counter, next/prev, and escape."""
    def __init__(self, parent, target_textbox: ctk.CTkTextbox, on_close=None, **kwargs):
        super().__init__(parent, fg_color="#F1F5F9", corner_radius=6, border_color="#CBD5E1", border_width=1, height=32, **kwargs)
        self.target_textbox = target_textbox
        self.on_close = on_close
        self.matches: List[Tuple[str, str]] = []
        self.current_match_idx = -1

        # Search icon
        lbl_icon = ctk.CTkLabel(self, text="🔍", font=ctk.CTkFont(size=12))
        lbl_icon.pack(side="left", padx=(8, 4), pady=2)

        # Search input entry (neat & compact width, never spans entire screen)
        self.entry = ctk.CTkEntry(
            self,
            placeholder_text="Find in text...",
            font=ctk.CTkFont(family=APP_FONT, size=11),
            width=170,
            height=24,
            corner_radius=4,
            border_color="#CBD5E1",
            fg_color="#FFFFFF",
            text_color="#0F172A"
        )
        self.entry.pack(side="left", padx=4, pady=2)
        self.entry.bind("<KeyRelease>", self._on_query_changed)
        self.entry.bind("<Return>", lambda e: self.next_match())
        self.entry.bind("<Shift-Return>", lambda e: self.prev_match())
        self.entry.bind("<Escape>", lambda e: self.close())

        # Match count label
        self.lbl_count = ctk.CTkLabel(
            self,
            text="",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            text_color="#64748B",
            width=65
        )
        self.lbl_count.pack(side="left", padx=2, pady=2)

        # Prev button (▲)
        self.btn_prev = ctk.CTkButton(
            self,
            text="▲",
            width=26,
            height=22,
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color="#FFFFFF",
            hover_color="#E2E8F0",
            text_color="#334155",
            corner_radius=4,
            command=self.prev_match
        )
        self.btn_prev.pack(side="left", padx=2, pady=2)
        add_tooltip(self.btn_prev, "Previous Match (Shift+Enter)")

        # Next button (▼)
        self.btn_next = ctk.CTkButton(
            self,
            text="▼",
            width=26,
            height=22,
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color="#FFFFFF",
            hover_color="#E2E8F0",
            text_color="#334155",
            corner_radius=4,
            command=self.next_match
        )
        self.btn_next.pack(side="left", padx=2, pady=2)
        add_tooltip(self.btn_next, "Next Match (Enter)")

        # Close button (✕)
        self.btn_close = ctk.CTkButton(
            self,
            text="✕",
            width=24,
            height=22,
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="transparent",
            hover_color="#FEE2E2",
            text_color="#DC2626",
            corner_radius=4,
            command=self.close
        )
        self.btn_close.pack(side="left", padx=(2, 6), pady=2)
        self.is_open = False

    def open_search(self, row=0, column=0, sticky="e"):
        self.is_open = True
        self.grid(row=row, column=column, sticky=sticky, padx=4, pady=(0, 4))
        self.focus_search()

    def focus_search(self):
        self.entry.focus_set()
        self.entry.select_range(0, "end")
        if self.entry.get():
            self._on_query_changed()

    def _clear_highlights(self):
        try:
            tb = self.target_textbox._textbox
            tb.tag_remove("search_match", "1.0", "end")
            tb.tag_remove("search_active", "1.0", "end")
        except Exception:
            pass

    def _on_query_changed(self, event=None):
        self._clear_highlights()
        query = self.entry.get()
        self.matches = []
        self.current_match_idx = -1

        if not query:
            self.lbl_count.configure(text="")
            return

        tb = self.target_textbox._textbox
        curr = "1.0"
        q_len = len(query)
        while True:
            pos = tb.search(query, curr, stopindex="end", nocase=True)
            if not pos:
                break
            end_pos = f"{pos}+{q_len}c"
            self.matches.append((pos, end_pos))
            tb.tag_add("search_match", pos, end_pos)
            curr = end_pos

        if self.matches:
            self.current_match_idx = 0
            self._highlight_active_match()
        else:
            self.lbl_count.configure(text="0 found")

    def _highlight_active_match(self):
        if not self.matches or self.current_match_idx < 0:
            return
        tb = self.target_textbox._textbox
        tb.tag_remove("search_active", "1.0", "end")
        start, end = self.matches[self.current_match_idx]
        tb.tag_add("search_active", start, end)
        tb.see(start)
        self.lbl_count.configure(text=f"{self.current_match_idx + 1} of {len(self.matches)}")

    def next_match(self):
        if not self.matches:
            return
        self.current_match_idx = (self.current_match_idx + 1) % len(self.matches)
        self._highlight_active_match()

    def prev_match(self):
        if not self.matches:
            return
        self.current_match_idx = (self.current_match_idx - 1) % len(self.matches)
        self._highlight_active_match()

    def close(self):
        self.is_open = False
        self._clear_highlights()
        self.matches = []
        self.current_match_idx = -1
        self.grid_remove()
        self.grid_forget()
        if self.on_close:
            self.on_close()


class APIClientView(ctk.CTkFrame):
    """Local API client and collection runner interface."""

    def __init__(self, parent, get_active_tunnel_info_callback=None):
        super().__init__(parent, fg_color="transparent")
        self.get_active_tunnel_info = get_active_tunnel_info_callback
        self.collection_manager = CollectionManager()
        self.active_collection_id: Optional[str] = None
        self.active_request_id: Optional[str] = None
        self.current_response: Optional[ResponseData] = None
        self.collapsed_collections = set()

        # Drag tracking
        self._drag_h_start_x = 0
        self._drag_h_start_w = 330
        self._drag_v_start_y = 0
        self._drag_v_start_body_h = 320
        self._drag_v_start_resp_h = 420

        # Request drag & drop reordering/moving state
        self._req_drag_data = None
        self._req_drag_ghost = None
        self._tree_drop_targets = []

        # Row structures
        self.params_rows = []
        self.headers_rows = []
        self.test_rows = []
        self._suppress_url_sync = False
        self.col_items_containers = {}
        self.col_chevrons = {}

        # Search bar instances
        self.body_search_bar = None
        self.resp_search_bar = None

        # Global keyboard shortcuts: Ctrl+S saves request, Ctrl+Enter sends request
        self.after(100, self._bind_global_shortcuts)

        # Build Main UI Layout
        self._build_layout()

        # Load initial collection & request
        cols = self.collection_manager.collections
        if cols:
            self.active_collection_id = cols[0].get("id")
            self._render_collection_tree()
            items = cols[0].get("items", [])
            if items:
                self._load_request_into_ui(cols[0]["id"], items[0]["id"])
            else:
                self._set_default_request_ui()
        else:
            self._render_collection_tree()
            self._set_default_request_ui()

    def _bind_global_shortcuts(self):
        try:
            top = self.winfo_toplevel()
            top.bind_all("<Control-s>", self._on_ctrl_s)
            top.bind_all("<Control-S>", self._on_ctrl_s)
            top.bind_all("<Control-Return>", lambda e: (self._send_request(), "break")[1])
        except Exception:
            pass

    def _on_ctrl_s(self, event=None):
        self._save_current_request()
        return "break"

    def _build_layout(self):
        """Constructs resizable split panes: [Sidebar] | (Sash H) | [Workspace: Request / (Sash V) / Response]."""
        self.sidebar_width = 330
        self.grid_columnconfigure(0, weight=0, minsize=self.sidebar_width)
        self.grid_columnconfigure(1, weight=0)  # Draggable Sash H
        self.grid_columnconfigure(2, weight=1)  # Workspace
        self.grid_rowconfigure(0, weight=1)

        # 1. Left Sidebar: Collections Navigation
        self.sidebar_frame = ctk.CTkFrame(
            self,
            fg_color="#FFFFFF",
            corner_radius=10,
            border_color="#E2E8F0",
            border_width=1,
            width=self.sidebar_width
        )
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)
        self.sidebar_frame.grid_propagate(False)
        self._build_sidebar(self.sidebar_frame)

        # 2. Draggable Horizontal Sash (Resize Sidebar Left/Right)
        self.sash_h = ctk.CTkFrame(
            self,
            width=10,
            fg_color="transparent",
            cursor="sb_h_double_arrow"
        )
        self.sash_h.grid(row=0, column=1, sticky="ns", padx=0, pady=0)

        self.sash_h_line = ctk.CTkFrame(self.sash_h, width=3, corner_radius=1, fg_color="#CBD5E1")
        self.sash_h_line.pack(fill="y", expand=True, padx=3, pady=6)

        for w in (self.sash_h, self.sash_h_line):
            w.bind("<Button-1>", self._on_sash_h_start)
            w.bind("<B1-Motion>", self._on_sash_h_drag)
            w.bind("<ButtonRelease-1>", self._on_sash_h_end)
            w.bind("<Enter>", lambda e: self.sash_h_line.configure(fg_color="#2563EB"))
            w.bind("<Leave>", lambda e: self.sash_h_line.configure(fg_color="#CBD5E1"))

        # 3. Right Workspace (Fully scrollable page container so entire request & response are 100% visible)
        self.workspace_frame = ctk.CTkScrollableFrame(
            self,
            fg_color="transparent",
            scrollbar_button_color="#CBD5E1",
            scrollbar_button_hover_color="#94A3B8"
        )
        self.workspace_frame.grid(row=0, column=2, sticky="nsew", padx=(2, 0))
        self.workspace_frame.grid_columnconfigure(0, weight=1)
        self._build_workspace(self.workspace_frame)

    def _bind_smart_mousewheel(self, widget):
        """
        Binds smart mousewheel scrolling to a text widget, scrollable frame, or container.
        - If the widget has its own internal vertical scroll (like a Text widget with lines),
          it scrolls the internal text.
        - When the widget content fits or reaches the top/bottom boundary,
          it scrolls self.workspace_frame._parent_canvas so the main workspace page scrolls seamlessly!
        """
        def _on_mousewheel(event):
            delta = getattr(event, "delta", 0)
            num = getattr(event, "num", 0)
            is_up = delta > 0 if delta != 0 else (num == 4)

            can_scroll_internally = False
            raw_text = None
            if hasattr(widget, "_textbox"):
                raw_text = widget._textbox
            elif isinstance(widget, tk.Text):
                raw_text = widget

            if raw_text is not None:
                try:
                    y1, y2 = raw_text.yview()
                    if is_up and y1 > 0.005:
                        can_scroll_internally = True
                    elif not is_up and y2 < 0.995:
                        can_scroll_internally = True
                except Exception:
                    pass

            if can_scroll_internally and raw_text is not None:
                try:
                    if delta != 0:
                        raw_text.yview_scroll(-int(delta / 120) * 3, "units")
                    else:
                        raw_text.yview_scroll(-2 if is_up else 2, "units")
                except Exception:
                    pass
                return "break"
            else:
                # Forward scroll to the main workspace canvas
                if hasattr(self, "workspace_frame") and hasattr(self.workspace_frame, "_parent_canvas"):
                    try:
                        canvas = self.workspace_frame._parent_canvas
                        if delta != 0:
                            canvas.yview("scroll", -int(delta / 6), "units")
                        else:
                            canvas.yview("scroll", -2 if is_up else 2, "units")
                    except Exception:
                        pass
                return "break"

        targets = [widget]
        if hasattr(widget, "_textbox"):
            targets.append(widget._textbox)
        if hasattr(widget, "_parent_canvas"):
            targets.append(widget._parent_canvas)

        for t in targets:
            try:
                t.bind("<MouseWheel>", _on_mousewheel, add="+")
                t.bind("<Button-4>", _on_mousewheel, add="+")
                t.bind("<Button-5>", _on_mousewheel, add="+")
            except Exception:
                pass

    def _on_sash_h_start(self, event):
        self._drag_h_start_x = event.x_root
        self._drag_h_start_w = self.sidebar_frame.winfo_width()
        if hasattr(self, "sash_h_line"):
            self.sash_h_line.configure(fg_color="#2563EB")

    def _on_sash_h_drag(self, event):
        if not hasattr(self, "_drag_h_start_x"):
            self._drag_h_start_x = event.x_root
            self._drag_h_start_w = self.sidebar_frame.winfo_width()
        total_w = self.winfo_width()
        delta = event.x_root - self._drag_h_start_x
        # Guarantee minimum workspace width of 550px so URL bar, radio buttons and controls are never crushed
        max_allowed_w = max(220, min(420, total_w - 550))
        new_width = max(200, min(max_allowed_w, int(self._drag_h_start_w + delta)))
        if abs(new_width - self.sidebar_width) >= 3:
            self.sidebar_width = new_width
            self.sidebar_frame.configure(width=new_width)
            self.grid_columnconfigure(0, minsize=new_width)

    def _on_sash_h_end(self, event=None):
        if hasattr(self, "sash_h_line"):
            self.sash_h_line.configure(fg_color="#CBD5E1")

    # -------------------------------------------------------------------------
    # SIDEBAR: COLLECTIONS & ACTIONS
    # -------------------------------------------------------------------------
    def _build_sidebar(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(3, weight=1)

        # Header
        h_frame = ctk.CTkFrame(parent, fg_color="transparent")
        h_frame.grid(row=0, column=0, sticky="ew", padx=14, pady=(12, 6))

        title = ctk.CTkLabel(
            h_frame,
            text="Collections",
            font=ctk.CTkFont(family=APP_FONT, size=15, weight="bold"),
            text_color="#0F172A"
        )
        title.pack(side="left")

        btn_add_col_quick = ctk.CTkButton(
            h_frame,
            text="+",
            width=22,
            height=22,
            corner_radius=4,
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            font=ctk.CTkFont(family=APP_FONT, size=14, weight="bold"),
            command=self._on_click_new_collection
        )
        btn_add_col_quick.pack(side="left", padx=(6, 0))
        add_tooltip(btn_add_col_quick, "Create New Collection")

        self.col_count_badge = ctk.CTkLabel(
            h_frame,
            text=f"{len(self.collection_manager.collections)}",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#2563EB",
            fg_color="#EFF6FF",
            corner_radius=10,
            padx=8,
            pady=2
        )
        self.col_count_badge.pack(side="right")

        self.btn_toggle_all = ctk.CTkButton(
            h_frame,
            text="▾ All",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#475569",
            corner_radius=4,
            width=38,
            height=20,
            command=self._toggle_collapse_all
        )
        self.btn_toggle_all.pack(side="right", padx=(0, 6))

        # Action Buttons: + Col | + Req | 📥 Import
        btn_bar = ctk.CTkFrame(parent, fg_color="transparent")
        btn_bar.grid(row=1, column=0, sticky="ew", padx=12, pady=(0, 8))

        btn_new_col = ctk.CTkButton(
            btn_bar,
            text="+ Col",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#0284C7",
            hover_color="#0369A1",
            text_color="#FFFFFF",
            corner_radius=6,
            height=28,
            width=76,
            command=self._on_click_new_collection
        )
        btn_new_col.pack(side="left", padx=(0, 5))
        add_tooltip(btn_new_col, "Create New API Collection")

        btn_new_req = ctk.CTkButton(
            btn_bar,
            text="+ Req",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#2563EB",
            hover_color="#1D4ED8",
            text_color="#FFFFFF",
            corner_radius=6,
            height=28,
            width=76,
            command=self._on_click_new_request
        )
        btn_new_req.pack(side="left", padx=(0, 5))
        add_tooltip(btn_new_req, "Create New HTTP Request in Active Collection")

        btn_import = ctk.CTkButton(
            btn_bar,
            text="📥 Import",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            corner_radius=6,
            height=28,
            width=84,
            command=self._open_import_dialog
        )
        btn_import.pack(side="left", padx=(0, 0))
        add_tooltip(btn_import, "Import Collection (OpenAPI / Swagger / Link / File)")

        # Search Bar
        search_box = ctk.CTkFrame(parent, fg_color="transparent")
        search_box.grid(row=2, column=0, sticky="ew", padx=12, pady=(0, 6))

        self.search_entry = ctk.CTkEntry(
            search_box,
            placeholder_text="🔍 Filter requests...",
            height=28,
            corner_radius=6,
            font=ctk.CTkFont(family=APP_FONT, size=11),
            border_color="#CBD5E1",
            fg_color="#F8FAFC"
        )
        self.search_entry.pack(fill="x")

        def _on_filter_key(e):
            if getattr(self, "_search_filter_timer", None):
                try:
                    self.after_cancel(self._search_filter_timer)
                except Exception:
                    pass
            self._search_filter_timer = self.after(100, self._render_collection_tree)

        self.search_entry.bind("<KeyRelease>", _on_filter_key)

        # Scrollable Collection Tree
        self.tree_scroll = ctk.CTkScrollableFrame(
            parent,
            fg_color="transparent",
            scrollbar_button_color="#CBD5E1",
            scrollbar_button_hover_color="#94A3B8"
        )
        self.tree_scroll.grid(row=3, column=0, sticky="nsew", padx=6, pady=(0, 8))

    def _toggle_collapse_all(self):
        all_ids = {c.get("id") for c in self.collection_manager.collections if c.get("id")}
        if self.collapsed_collections:
            self.collapsed_collections.clear()
            if hasattr(self, "btn_toggle_all"):
                self.btn_toggle_all.configure(text="▾ All")
            for cid, container in getattr(self, "col_items_containers", {}).items():
                try:
                    container.pack(fill="x", expand=False, padx=2, pady=(0, 4))
                except Exception:
                    pass
            for cid, btn in getattr(self, "col_chevrons", {}).items():
                try:
                    btn.configure(text="▼")
                except Exception:
                    pass
        else:
            self.collapsed_collections = set(all_ids)
            if hasattr(self, "btn_toggle_all"):
                self.btn_toggle_all.configure(text="▸ All")
            for cid, container in getattr(self, "col_items_containers", {}).items():
                try:
                    container.pack_forget()
                except Exception:
                    pass
            for cid, btn in getattr(self, "col_chevrons", {}).items():
                try:
                    btn.configure(text="▶")
                except Exception:
                    pass

    def _toggle_collection_collapse(self, col_id: str):
        if col_id in self.collapsed_collections:
            self.collapsed_collections.remove(col_id)
            if col_id in getattr(self, "col_items_containers", {}):
                try:
                    self.col_items_containers[col_id].pack(fill="x", expand=False, padx=2, pady=(0, 4))
                except Exception:
                    pass
            if col_id in getattr(self, "col_chevrons", {}):
                try:
                    self.col_chevrons[col_id].configure(text="▼")
                except Exception:
                    pass
        else:
            self.collapsed_collections.add(col_id)
            if col_id in getattr(self, "col_items_containers", {}):
                try:
                    self.col_items_containers[col_id].pack_forget()
                except Exception:
                    pass
            if col_id in getattr(self, "col_chevrons", {}):
                try:
                    self.col_chevrons[col_id].configure(text="▶")
                except Exception:
                    pass

    def _on_select_collection(self, col_id: str):
        self.active_collection_id = col_id
        col = self.collection_manager.get_collection(col_id)
        if col:
            base_url = col.get("variables", {}).get("baseUrl", "http://localhost:8000")
            self.base_url_entry.delete(0, "end")
            self.base_url_entry.insert(0, base_url)
        self._render_collection_tree()

    def _start_inline_rename_collection(self, col_id: str, col_header: ctk.CTkFrame, current_name: str):
        for w in col_header.winfo_children():
            w.destroy()

        entry = ctk.CTkEntry(
            col_header,
            height=24,
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold")
        )
        entry.pack(side="left", fill="x", expand=True, padx=(2, 4))
        entry.insert(0, current_name)
        entry.select_range(0, "end")
        entry.focus_set()

        def _do_save():
            new_val = entry.get().strip()
            if new_val:
                self.collection_manager.rename_collection(col_id, new_val)
            self._render_collection_tree()

        def _do_cancel():
            self._render_collection_tree()

        btn_ok = ctk.CTkButton(
            col_header,
            text="✓ Save",
            width=52,
            height=22,
            corner_radius=4,
            fg_color="#10B981",
            hover_color="#059669",
            text_color="#FFFFFF",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            command=_do_save
        )
        btn_ok.pack(side="left", padx=2)

        btn_cancel = ctk.CTkButton(
            col_header,
            text="✕ Cancel",
            width=58,
            height=22,
            corner_radius=4,
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#64748B",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            command=_do_cancel
        )
        btn_cancel.pack(side="left", padx=(2, 0))

        entry.bind("<Return>", lambda e: _do_save())
        entry.bind("<Escape>", lambda e: _do_cancel())

    def _start_inline_rename_request(self, col_id: str, req_id: str, req_row: ctk.CTkFrame, current_name: str):
        for w in req_row.winfo_children():
            w.destroy()

        entry = ctk.CTkEntry(
            req_row,
            height=24,
            font=ctk.CTkFont(family=APP_FONT, size=11)
        )
        entry.pack(side="left", fill="x", expand=True, padx=(4, 4))
        entry.insert(0, current_name)
        entry.select_range(0, "end")
        entry.focus_set()

        def _do_save():
            new_val = entry.get().strip()
            if new_val:
                self.collection_manager.rename_request(col_id, req_id, new_val)
                if self.active_request_id == req_id:
                    self.req_name_entry.delete(0, "end")
                    self.req_name_entry.insert(0, new_val)
            self._render_collection_tree()

        def _do_cancel():
            self._render_collection_tree()

        btn_ok = ctk.CTkButton(
            req_row,
            text="✓ Save",
            width=50,
            height=22,
            corner_radius=4,
            fg_color="#10B981",
            hover_color="#059669",
            text_color="#FFFFFF",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            command=_do_save
        )
        btn_ok.pack(side="left", padx=2)

        btn_cancel = ctk.CTkButton(
            req_row,
            text="✕ Cancel",
            width=54,
            height=22,
            corner_radius=4,
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#64748B",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            command=_do_cancel
        )
        btn_cancel.pack(side="left", padx=(2, 2))

        entry.bind("<Return>", lambda e: _do_save())
        entry.bind("<Escape>", lambda e: _do_cancel())

    def _share_specific_collection(self, col_id: str):
        self.active_collection_id = col_id
        col = self.collection_manager.get_collection(col_id)
        if not col:
            return
        self._show_in_page_view(lambda panel: self._build_in_page_share(panel, col))

    def _on_click_new_request_in_col(self, col_id: str):
        self.active_collection_id = col_id
        self.active_request_id = None
        self._set_default_request_ui()
        self._save_current_request()

    def _duplicate_collection(self, col_id: str):
        new_col = self.collection_manager.duplicate_collection(col_id)
        if new_col:
            self.active_collection_id = new_col.get("id")
            self._render_collection_tree()
            self._show_status_banner(f"✓ Duplicated collection: {new_col.get('name')}", is_error=False)

    def _duplicate_request(self, col_id: str, req_id: str):
        new_req = self.collection_manager.duplicate_request(col_id, req_id)
        if new_req:
            self.active_collection_id = col_id
            self.active_request_id = new_req.get("id")
            self._render_collection_tree()
            self._load_request_into_ui(col_id, new_req.get("id"))
            self._show_status_banner(f"✓ Duplicated request: {new_req.get('name')}", is_error=False)

    def _show_collection_menu(self, event, col_id: str, col_name: str, col_header: ctk.CTkFrame, widget=None):
        menu = tk.Menu(self, tearoff=0, font=(APP_FONT, 10), bg="#FFFFFF", fg="#0F172A", activebackground="#EFF6FF", activeforeground="#2563EB")
        menu.add_command(label="➕  Add Request", command=lambda: self._on_click_new_request_in_col(col_id))
        menu.add_command(label="📋  Duplicate Collection", command=lambda: self._duplicate_collection(col_id))
        menu.add_command(label="✏️  Rename", command=lambda: self._start_inline_rename_collection(col_id, col_header, col_name))
        menu.add_command(label="🔗  Share / Export", command=lambda: self._share_specific_collection(col_id))
        menu.add_separator()
        menu.add_command(label="🗑️  Delete Collection", command=lambda: self._confirm_delete_collection(col_id))

        if event and hasattr(event, "x_root") and hasattr(event, "y_root"):
            x, y = event.x_root, event.y_root
        elif widget:
            x = widget.winfo_rootx()
            y = widget.winfo_rooty() + widget.winfo_height()
        else:
            x = self.winfo_pointerx()
            y = self.winfo_pointery()
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()

    def _show_request_menu(self, event, col_id: str, req_id: str, req_name: str, req_row: ctk.CTkFrame, widget=None):
        menu = tk.Menu(self, tearoff=0, font=(APP_FONT, 10), bg="#FFFFFF", fg="#0F172A", activebackground="#EFF6FF", activeforeground="#2563EB")
        menu.add_command(label="📋  Duplicate Request", command=lambda: self._duplicate_request(col_id, req_id))
        menu.add_command(label="✏️  Rename", command=lambda: self._start_inline_rename_request(col_id, req_id, req_row, req_name))
        menu.add_separator()
        menu.add_command(label="🗑️  Delete Request", command=lambda: self._confirm_delete_request(col_id, req_id))

        if event and hasattr(event, "x_root") and hasattr(event, "y_root"):
            x, y = event.x_root, event.y_root
        elif widget:
            x = widget.winfo_rootx()
            y = widget.winfo_rooty() + widget.winfo_height()
        else:
            x = self.winfo_pointerx()
            y = self.winfo_pointery()
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()

    # -------------------------------------------------------------------------
    # REQUEST DRAG & DROP: REORDERING WITHIN & MOVING BETWEEN COLLECTIONS
    # -------------------------------------------------------------------------
    def _on_req_press(self, event, col_id: str, req_id: str, req_name: str, req_row: ctk.CTkFrame):
        self._req_drag_data = {
            "col_id": col_id,
            "req_id": req_id,
            "name": req_name,
            "row": req_row,
            "start_x": event.x_root,
            "start_y": event.y_root,
            "is_dragging": False,
            "highlighted_target": None
        }

    def _on_req_motion(self, event):
        data = getattr(self, "_req_drag_data", None)
        if not data:
            return

        # Start drag once moved past threshold of 5 pixels
        if not data["is_dragging"]:
            dx = abs(event.x_root - data["start_x"])
            dy = abs(event.y_root - data["start_y"])
            if dx > 5 or dy > 5:
                data["is_dragging"] = True
                try:
                    self._req_drag_ghost = tk.Toplevel(self)
                    self._req_drag_ghost.overrideredirect(True)
                    self._req_drag_ghost.attributes("-topmost", True)
                    lbl = tk.Label(
                        self._req_drag_ghost,
                        text=f" ⠿  {data['name']} ",
                        bg="#2563EB",
                        fg="#FFFFFF",
                        font=(APP_FONT, 9, "bold"),
                        padx=8,
                        pady=4,
                        relief="ridge",
                        bd=1
                    )
                    lbl.pack()
                except Exception:
                    pass

        if data["is_dragging"]:
            if getattr(self, "_req_drag_ghost", None):
                try:
                    self._req_drag_ghost.geometry(f"+{event.x_root + 15}+{event.y_root + 10}")
                except Exception:
                    pass

            cur_target = self._find_drop_target(event.x_root, event.y_root)
            old_target = data.get("highlighted_target")
            if cur_target != old_target:
                if old_target:
                    self._set_target_highlight(old_target, False)
                if cur_target and (cur_target.get("req_id") != data["req_id"]):
                    self._set_target_highlight(cur_target, True)
                data["highlighted_target"] = cur_target if (cur_target and cur_target.get("req_id") != data["req_id"]) else None

    def _find_drop_target(self, x: int, y: int):
        targets = getattr(self, "_tree_drop_targets", [])
        # 1. Prioritize specific request targets first for precise reordering
        for t in targets:
            if t.get("type") == "request":
                w = t["widget"]
                try:
                    wy = w.winfo_rooty()
                    wh = w.winfo_height()
                    wx = w.winfo_rootx()
                    ww = w.winfo_width()
                    if (wy <= y <= wy + wh) and (wx - 30 <= x <= wx + ww + 30):
                        return t
                except Exception:
                    pass
        # 2. Check collection targets (e.g. empty collection cards or headers)
        for t in targets:
            if t.get("type") == "collection":
                w = t["widget"]
                try:
                    wy = w.winfo_rooty()
                    wh = w.winfo_height()
                    wx = w.winfo_rootx()
                    ww = w.winfo_width()
                    if (wy <= y <= wy + wh) and (wx - 30 <= x <= wx + ww + 30):
                        return t
                except Exception:
                    pass
        return None

    def _set_target_highlight(self, target: Dict[str, Any], highlight: bool):
        w = target.get("widget")
        if not w:
            return
        try:
            if target["type"] == "request":
                if highlight:
                    w.configure(fg_color="#BAE6FD")
                else:
                    is_active = (target.get("req_id") == self.active_request_id)
                    w.configure(fg_color="#DBEAFE" if is_active else "transparent")
            elif target["type"] == "collection":
                if highlight:
                    w.configure(border_color="#2563EB", border_width=2)
                else:
                    is_active = (target.get("col_id") == self.active_collection_id)
                    w.configure(border_color="#93C5FD" if is_active else "#E2E8F0", border_width=1)
        except Exception:
            pass

    def _on_req_release(self, event, col_id: str, req_id: str):
        data = getattr(self, "_req_drag_data", None)
        if not data:
            self._load_request_into_ui(col_id, req_id)
            return

        is_dragging = data.get("is_dragging", False)
        target = data.get("highlighted_target") or self._find_drop_target(event.x_root, event.y_root)

        if getattr(self, "_req_drag_ghost", None):
            try:
                self._req_drag_ghost.destroy()
            except Exception:
                pass
            self._req_drag_ghost = None

        if target:
            self._set_target_highlight(target, False)

        self._req_drag_data = None

        if is_dragging and target:
            src_col_id = data["col_id"]
            src_req_id = data["req_id"]
            req_name = data["name"]

            if target["type"] == "request":
                dest_col_id = target["col_id"]
                dest_req_id = target["req_id"]
                dest_index = target["index"]

                try:
                    w = target["widget"]
                    mid_y = w.winfo_rooty() + w.winfo_height() // 2
                    if event.y_root >= mid_y:
                        dest_index += 1
                except Exception:
                    pass

                if src_col_id == dest_col_id:
                    if src_req_id != dest_req_id:
                        self.collection_manager.reorder_request(src_col_id, src_req_id, dest_index)
                        self._show_status_banner(f"✓ Reordered '{req_name}'", is_error=False)
                else:
                    self.collection_manager.move_request(src_col_id, dest_col_id, src_req_id, dest_index)
                    dest_col = self.collection_manager.get_collection(dest_col_id)
                    dest_name = dest_col.get("name") if dest_col else "collection"
                    self._show_status_banner(f"✓ Moved '{req_name}' to '{dest_name}'", is_error=False)

            elif target["type"] == "collection":
                dest_col_id = target["col_id"]
                if src_col_id != dest_col_id:
                    self.collection_manager.move_request(src_col_id, dest_col_id, src_req_id)
                    dest_col = self.collection_manager.get_collection(dest_col_id)
                    dest_name = dest_col.get("name") if dest_col else "collection"
                    self._show_status_banner(f"✓ Moved '{req_name}' to '{dest_name}'", is_error=False)

            self.active_collection_id = target["col_id"]
            self.active_request_id = src_req_id
            self._render_collection_tree()
        elif not is_dragging:
            self._load_request_into_ui(col_id, req_id)

    def _render_collection_tree(self):
        for widget in self.tree_scroll.winfo_children():
            widget.destroy()

        self._tree_drop_targets = []
        filter_q = self.search_entry.get().strip().lower() if hasattr(self, "search_entry") else ""
        self.col_count_badge.configure(text=f"{len(self.collection_manager.collections)}")

        if not self.collection_manager.collections:
            empty_frame = ctk.CTkFrame(self.tree_scroll, fg_color="transparent")
            empty_frame.pack(fill="x", pady=24, padx=8)
            ctk.CTkLabel(
                empty_frame,
                text="📂 No Collections",
                font=ctk.CTkFont(family=APP_FONT, size=13, weight="bold"),
                text_color="#64748B"
            ).pack(pady=(0, 4))
            ctk.CTkLabel(
                empty_frame,
                text="Create a collection or send requests directly from the editor.",
                font=ctk.CTkFont(family=APP_FONT, size=11),
                text_color="#94A3B8",
                wraplength=200,
                justify="center"
            ).pack(pady=(0, 10))
            ctk.CTkButton(
                empty_frame,
                text="+ New Collection",
                height=26,
                corner_radius=6,
                font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
                fg_color="#EFF6FF",
                text_color="#2563EB",
                hover_color="#DBEAFE",
                command=self._on_click_new_collection
            ).pack()
            return

        for col in self.collection_manager.collections:
            c_id = col.get("id")
            c_name = col.get("name", "Untitled Collection")
            is_active_col = (c_id == self.active_collection_id)
            is_collapsed = (c_id in self.collapsed_collections)

            items = col.get("items", [])
            if filter_q:
                matching_items = [it for it in items if filter_q in it.get("name", "").lower() or filter_q in it.get("request", {}).get("url", "").lower()]
                if not matching_items and filter_q not in c_name.lower():
                    continue
            else:
                matching_items = items

            col_card = ctk.CTkFrame(
                self.tree_scroll,
                fg_color="#F8FAFC" if not is_active_col else "#EFF6FF",
                corner_radius=8,
                border_color="#E2E8F0" if not is_active_col else "#93C5FD",
                border_width=1
            )
            col_card.pack(fill="x", pady=4, padx=2)

            # Register collection drop target
            self._tree_drop_targets.append({
                "type": "collection",
                "col_id": c_id,
                "widget": col_card,
                "name": c_name
            })

            col_header = ctk.CTkFrame(col_card, fg_color="transparent")
            col_header.pack(fill="x", padx=6, pady=4)

            # Action button on right: 3 vertical dots (⋮) containing Add Request, Duplicate, Rename, Share, Delete
            btn_col_dots = ctk.CTkButton(
                col_header,
                text="⋮",
                width=24,
                height=24,
                corner_radius=4,
                fg_color="transparent",
                hover_color="#E2E8F0",
                text_color="#475569",
                font=ctk.CTkFont(family=APP_FONT, size=15, weight="bold")
            )
            btn_col_dots.pack(side="right", padx=(2, 2))
            btn_col_dots.configure(command=lambda cid=c_id, cname=c_name, hdr=col_header, b=btn_col_dots: self._show_collection_menu(None, cid, cname, hdr, widget=b))
            btn_col_dots.bind("<Button-1>", lambda e, cid=c_id, cname=c_name, hdr=col_header, b=btn_col_dots: (self._show_collection_menu(e, cid, cname, hdr, widget=b), "break")[1])
            add_tooltip(btn_col_dots, "Collection Actions (Add Request, Duplicate, Rename, Share, Delete)")

            # Accordion toggle chevron on left (▼ / ▶)
            chevron_symbol = "▶" if is_collapsed else "▼"
            btn_chevron = ctk.CTkButton(
                col_header,
                text=chevron_symbol,
                width=24,
                height=24,
                corner_radius=5,
                fg_color="transparent",
                hover_color="#E2E8F0",
                text_color="#64748B",
                font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
                command=lambda cid=c_id: self._toggle_collection_collapse(cid)
            )
            btn_chevron.pack(side="left", padx=(0, 2))
            add_tooltip(btn_chevron, "Expand / Collapse Collection")
            self.col_chevrons[c_id] = btn_chevron

            lbl_folder = ctk.CTkLabel(
                col_header,
                text=f"📁 {c_name} ({len(items)})",
                font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
                text_color="#0F172A" if not is_active_col else "#1D4ED8",
                anchor="w"
            )
            lbl_folder.pack(side="left", fill="x", expand=True)
            lbl_folder.bind("<Button-1>", lambda e, cid=c_id: self._on_select_collection(cid))

            # Requests container frame under this collection card (compact & non-greedy)
            col_items_frame = ctk.CTkFrame(col_card, fg_color="transparent")
            self.col_items_containers[c_id] = col_items_frame

            for req_idx, it in enumerate(matching_items):
                req_id = it.get("id")
                req_name = it.get("name", "Request")
                req_data = it.get("request", {})
                method = req_data.get("method", "GET").upper()
                is_selected = (req_id == self.active_request_id)
                real_idx = next((i for i, item in enumerate(col.get("items", [])) if item.get("id") == req_id), req_idx)

                colors = METHOD_COLORS.get(method, {"badge_text": "#475569", "badge_bg": "#F1F5F9"})

                req_row = ctk.CTkFrame(
                    col_items_frame,
                    fg_color="#DBEAFE" if is_selected else "transparent",
                    corner_radius=6,
                    height=30
                )
                req_row.pack(fill="x", padx=4, pady=1)

                # Register request drop target
                self._tree_drop_targets.append({
                    "type": "request",
                    "col_id": c_id,
                    "req_id": req_id,
                    "index": real_idx,
                    "widget": req_row,
                    "name": req_name
                })

                # Action button on right: 3 vertical dots (⋮) containing Duplicate, Rename, Delete
                btn_req_dots = ctk.CTkButton(
                    req_row,
                    text="⋮",
                    width=22,
                    height=22,
                    corner_radius=4,
                    fg_color="transparent",
                    hover_color="#E2E8F0",
                    text_color="#475569",
                    font=ctk.CTkFont(family=APP_FONT, size=14, weight="bold")
                )
                btn_req_dots.pack(side="right", padx=(2, 4), pady=2)
                btn_req_dots.configure(command=lambda cid=c_id, rid=req_id, rname=req_name, row=req_row, b=btn_req_dots: self._show_request_menu(None, cid, rid, rname, row, widget=b))
                btn_req_dots.bind("<Button-1>", lambda e, cid=c_id, rid=req_id, rname=req_name, row=req_row, b=btn_req_dots: (self._show_request_menu(e, cid, rid, rname, row, widget=b), "break")[1])
                add_tooltip(btn_req_dots, "Request Actions (Duplicate, Rename, Delete)")

                lbl_drag = ctk.CTkLabel(
                    req_row,
                    text="⠿",
                    width=14,
                    height=20,
                    font=ctk.CTkFont(family=APP_FONT, size=12),
                    text_color="#94A3B8",
                    cursor="fleur"
                )
                lbl_drag.pack(side="left", padx=(4, 1))
                add_tooltip(lbl_drag, "Drag to reorder or move between collections")

                m_badge = ctk.CTkLabel(
                    req_row,
                    text=method,
                    width=46,
                    height=20,
                    font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                    text_color=colors["badge_text"],
                    fg_color=colors["badge_bg"],
                    corner_radius=4,
                    padx=2,
                    pady=1
                )
                m_badge.pack(side="left", padx=(2, 6), pady=2)

                lbl_name = ctk.CTkLabel(
                    req_row,
                    text=req_name,
                    font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold" if is_selected else "normal"),
                    text_color="#1E293B",
                    anchor="w"
                )
                lbl_name.pack(side="left", fill="x", expand=True)

                # Bind drag & drop handlers on the entire row, grip, badge, and label
                for w in (req_row, lbl_drag, m_badge, lbl_name):
                    w.bind("<Button-1>", lambda e, cid=c_id, rid=req_id, rname=req_name, rrow=req_row: self._on_req_press(e, cid, rid, rname, rrow))
                    w.bind("<B1-Motion>", self._on_req_motion)
                    w.bind("<ButtonRelease-1>", lambda e, cid=c_id, rid=req_id: self._on_req_release(e, cid, rid))

            # If collection has no requests, render compact drop zone placeholder (prevents large empty space!)
            if not matching_items:
                lbl_empty = ctk.CTkLabel(
                    col_items_frame,
                    text="No requests (drag requests here)",
                    font=ctk.CTkFont(family=APP_FONT, size=10, slant="italic"),
                    text_color="#94A3B8",
                    height=22
                )
                lbl_empty.pack(fill="x", pady=3, padx=8)

            if is_collapsed:
                col_items_frame.pack_forget()
            else:
                col_items_frame.pack(fill="x", expand=False, padx=2, pady=(0, 4))

    # -------------------------------------------------------------------------
    # WORKSPACE: BASE URL + REQUEST + DRAGGABLE SASH V + RESPONSE
    # -------------------------------------------------------------------------
    # -------------------------------------------------------------------------
    # WORKSPACE: INLINE BASE URL + REQUEST + SMOOTH DRAGGABLE SASH V + RESPONSE
    # -------------------------------------------------------------------------
    def _build_workspace(self, parent: ctk.CTkFrame):
        # In-Page Overlay Panel (Zero external popup windows - all sub-tools render directly in this page!)
        self.in_page_panel = ctk.CTkFrame(
            parent,
            fg_color="#FFFFFF",
            corner_radius=10,
            border_color="#CBD5E1",
            border_width=1
        )

        # Request Card (Top - natural height to fit contents)
        self.req_card = ctk.CTkFrame(parent, fg_color="#FFFFFF", corner_radius=10, border_color="#E2E8F0", border_width=1)
        self.req_card.pack(fill="x", expand=False, pady=(0, 2))
        self._build_request_editor(self.req_card)

        # Draggable Vertical Sash (Throttled smooth drag - zero blinking/flicker)
        self.sash_v = ctk.CTkFrame(
            parent,
            height=14,
            fg_color="transparent",
            cursor="sb_v_double_arrow"
        )
        self.sash_v.pack(fill="x", expand=False, pady=1)

        self.sash_v_grip = ctk.CTkFrame(
            self.sash_v,
            width=80,
            height=4,
            corner_radius=2,
            fg_color="#CBD5E1"
        )
        self.sash_v_grip.pack(pady=5)

        for w in (self.sash_v, self.sash_v_grip):
            w.bind("<Button-1>", self._on_sash_v_start)
            w.bind("<B1-Motion>", self._on_sash_v_drag)
            w.bind("<ButtonRelease-1>", self._on_sash_v_end)
            w.bind("<Enter>", lambda e: self.sash_v_grip.configure(fg_color="#2563EB"))
            w.bind("<Leave>", lambda e: self.sash_v_grip.configure(fg_color="#CBD5E1"))

        # Response Card (Bottom - docked at 10% until response generated)
        self.resp_card = ctk.CTkFrame(parent, fg_color="#FFFFFF", corner_radius=10, border_color="#E2E8F0", border_width=1)
        self.resp_card.pack(fill="x", expand=False, pady=(2, 0))
        self._build_response_viewer(self.resp_card)
        self._set_response_state(has_response=False)
        self._bind_smart_mousewheel(self.req_card)
        self._bind_smart_mousewheel(self.resp_card)

    def _show_in_page_view(self, builder_func):
        """Renders tools like Runner, Import, and Share directly on this page without opening any secondary windows."""
        for child in self.in_page_panel.winfo_children():
            child.destroy()
        self.req_card.pack_forget()
        self.sash_v.pack_forget()
        self.resp_card.pack_forget()
        self.in_page_panel.pack(fill="both", expand=True, pady=0)
        builder_func(self.in_page_panel)

    def _hide_in_page_view(self):
        """Restores the standard request and response workspace."""
        self.in_page_panel.pack_forget()
        self.req_card.pack(fill="x", expand=False, pady=(0, 2))
        self.sash_v.pack(fill="x", expand=False, pady=1)
        self.resp_card.pack(fill="x", expand=True, pady=(2, 0))

    def _set_panes_layout(self, mode: str):
        if mode == "maximize_response":
            if hasattr(self, "req_tabs"):
                self.req_tabs.grid_remove()
            if hasattr(self, "resp_body_textbox"):
                self.resp_body_textbox.configure(height=650)
            if hasattr(self, "resp_headers_scroll"):
                self.resp_headers_scroll.configure(height=650)
            if hasattr(self, "resp_cookies_scroll"):
                self.resp_cookies_scroll.configure(height=650)
            if hasattr(self, "resp_test_res_scroll"):
                self.resp_test_res_scroll.configure(height=650)
        elif mode == "maximize_request":
            if hasattr(self, "req_tabs"):
                self.req_tabs.grid()
            if hasattr(self, "body_textbox"):
                self.body_textbox.configure(height=480)
        else:  # "split_50_50"
            if hasattr(self, "req_tabs"):
                self.req_tabs.grid()
            if hasattr(self, "body_textbox"):
                self.body_textbox.configure(height=280)
            if hasattr(self, "resp_body_textbox"):
                self.resp_body_textbox.configure(height=380)
            if hasattr(self, "resp_headers_scroll"):
                self.resp_headers_scroll.configure(height=380)
            if hasattr(self, "resp_cookies_scroll"):
                self.resp_cookies_scroll.configure(height=380)
            if hasattr(self, "resp_test_res_scroll"):
                self.resp_test_res_scroll.configure(height=380)

    def _on_sash_v_start(self, event):
        self._drag_v_start_y = event.y_root
        self._drag_v_start_body_h = self.body_textbox.cget("height") if hasattr(self, "body_textbox") else 320
        self._drag_v_start_resp_h = self.resp_body_textbox.cget("height") if hasattr(self, "resp_body_textbox") else 420
        self._pending_v_resp_h = self._drag_v_start_resp_h
        self._pending_v_body_h = self._drag_v_start_body_h
        if hasattr(self, "sash_v_grip"):
            self.sash_v_grip.configure(fg_color="#2563EB")

    def _on_sash_v_drag(self, event):
        if not hasattr(self, "_drag_v_start_y"):
            self._drag_v_start_y = event.y_root
            self._drag_v_start_body_h = self.body_textbox.cget("height") if hasattr(self, "body_textbox") else 320
            self._drag_v_start_resp_h = self.resp_body_textbox.cget("height") if hasattr(self, "resp_body_textbox") else 420
        delta = event.y_root - self._drag_v_start_y
        self._pending_v_resp_h = max(180, min(800, int(self._drag_v_start_resp_h - delta)))
        self._pending_v_body_h = max(140, min(700, int(self._drag_v_start_body_h + delta)))
        if not getattr(self, "_sash_v_timer", None):
            self._sash_v_timer = self.after(50, self._apply_sash_v_resize)

    def _apply_sash_v_resize(self):
        self._sash_v_timer = None
        new_resp_h = getattr(self, "_pending_v_resp_h", None)
        new_body_h = getattr(self, "_pending_v_body_h", None)
        if new_resp_h is None or new_body_h is None:
            return
        if hasattr(self, "resp_body_textbox"):
            self.resp_body_textbox.configure(height=new_resp_h)
        if hasattr(self, "body_textbox"):
            self.body_textbox.configure(height=new_body_h)
        if hasattr(self, "resp_headers_scroll"):
            self.resp_headers_scroll.configure(height=new_resp_h)
        if hasattr(self, "resp_cookies_scroll"):
            self.resp_cookies_scroll.configure(height=new_resp_h)
        if hasattr(self, "resp_test_res_scroll"):
            self.resp_test_res_scroll.configure(height=new_resp_h)

    def _on_sash_v_end(self, event=None):
        if getattr(self, "_sash_v_timer", None):
            try:
                self.after_cancel(self._sash_v_timer)
            except Exception:
                pass
            self._sash_v_timer = None
        self._apply_sash_v_resize()
        if hasattr(self, "sash_v_grip"):
            self.sash_v_grip.configure(fg_color="#CBD5E1")

    def _on_base_url_edited(self):
        val = self.base_url_entry.get().strip()
        col = self.collection_manager.get_collection(self.active_collection_id) if self.active_collection_id else None
        if col:
            col.setdefault("variables", {})["baseUrl"] = val
            self.collection_manager.save()

    def _set_base_url_preset(self, url: str):
        self.base_url_entry.delete(0, "end")
        self.base_url_entry.insert(0, url)
        self._on_base_url_edited()

    def _apply_active_tunnel_url(self):
        tunnel_info = self.get_active_tunnel_info() if self.get_active_tunnel_info else {}
        pub_url = tunnel_info.get("public_url")
        if not pub_url:
            self._show_status_banner("No active public tunnel found. Start one in 'Tunnel Setup' first.", is_error=True)
            return
        self._set_base_url_preset(pub_url)
        self._show_status_banner(f"✓ Base URL set to active tunnel: {pub_url}", is_error=False)

    # -------------------------------------------------------------------------
    # REQUEST EDITOR WITH cURL, AUTO-GROWING TABLES & TEST ASSERTIONS
    # -------------------------------------------------------------------------
    def _build_request_editor(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(2, weight=1)

        # Title Bar: Request Name (left) | Compact Base URL (middle) | cURL + Save (right)
        title_bar = ctk.CTkFrame(parent, fg_color="transparent")
        title_bar.grid(row=0, column=0, sticky="ew", padx=12, pady=(6, 2))

        self.req_name_entry = ctk.CTkEntry(
            title_bar,
            font=ctk.CTkFont(family=APP_FONT, size=13, weight="bold"),
            fg_color="transparent",
            border_width=0,
            text_color="#0F172A",
            placeholder_text="Request Name...",
            width=170
        )
        self.req_name_entry.pack(side="left", padx=(0, 6))

        # Inline Base URL Pill
        base_container = ctk.CTkFrame(title_bar, fg_color="#F8FAFC", corner_radius=6, border_color="#E2E8F0", border_width=1)
        base_container.pack(side="left", fill="x", expand=True, padx=4)

        ctk.CTkLabel(
            base_container,
            text="Base:",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            text_color="#64748B"
        ).pack(side="left", padx=(6, 2))

        self.base_url_entry = ctk.CTkEntry(
            base_container,
            font=ctk.CTkFont(family=APP_FONT, size=11),
            height=24,
            border_width=0,
            fg_color="transparent",
            text_color="#0F172A"
        )
        self.base_url_entry.pack(side="left", fill="x", expand=True, padx=2)
        self.base_url_entry.bind("<KeyRelease>", lambda e: self._on_base_url_edited())

        self.btn_curl = ctk.CTkButton(
            title_bar,
            text="📋 cURL",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#0F172A",
            corner_radius=6,
            height=26,
            width=65,
            command=self._copy_as_curl
        )
        self.btn_curl.pack(side="right", padx=(4, 0))
        add_tooltip(self.btn_curl, "Copy as cURL Command")

        self.btn_save_req = ctk.CTkButton(
            title_bar,
            text="💾 Save",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            corner_radius=6,
            height=26,
            width=65,
            command=self._save_current_request
        )
        self.btn_save_req.pack(side="right")
        add_tooltip(self.btn_save_req, "Save Request (Ctrl+S)")

        # Main URL Input Bar
        url_bar = ctk.CTkFrame(parent, fg_color="transparent")
        url_bar.grid(row=1, column=0, sticky="ew", padx=14, pady=(0, 6))

        self.method_var = ctk.StringVar(value="GET")
        self.method_menu = ctk.CTkOptionMenu(
            url_bar,
            values=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
            variable=self.method_var,
            width=96,
            height=36,
            corner_radius=8,
            fg_color="#16A34A",
            button_color="#15803D",
            button_hover_color="#166534",
            text_color="#FFFFFF",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            command=self._on_method_change
        )
        self.method_menu.pack(side="left", padx=(0, 8))

        self.url_entry = ctk.CTkEntry(
            url_bar,
            placeholder_text="Enter URL (e.g. {{baseUrl}}/api/users or /api/users or http://localhost:8000/docs)",
            height=36,
            corner_radius=8,
            border_color="#CBD5E1",
            fg_color="#F8FAFC",
            text_color="#0F172A",
            font=ctk.CTkFont(family=APP_FONT, size=13)
        )
        self.url_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.url_entry.bind("<Return>", lambda e: self._send_request())
        self.url_entry.bind("<KeyRelease>", lambda e: self._on_url_entry_changed())

        self.btn_send = ctk.CTkButton(
            url_bar,
            text="▶ Send",
            font=ctk.CTkFont(family=APP_FONT, size=13, weight="bold"),
            fg_color="#2563EB",
            hover_color="#1D4ED8",
            text_color="#FFFFFF",
            corner_radius=8,
            height=36,
            width=90,
            command=self._send_request
        )
        self.btn_send.pack(side="right")
        add_tooltip(self.btn_send, "Send HTTP Request (Ctrl+Enter)")

        # Tabs: Params, Headers, Body, Auth, Tests
        self.req_tabs = ctk.CTkTabview(
            parent,
            fg_color="transparent",
            segmented_button_fg_color="#F1F5F9",
            segmented_button_selected_color="#2563EB",
            segmented_button_selected_hover_color="#1D4ED8",
            segmented_button_unselected_color="#F1F5F9",
            segmented_button_unselected_hover_color="#E2E8F0",
            text_color="#334155"
        )
        self.req_tabs.grid(row=2, column=0, sticky="nsew", padx=14, pady=(0, 6))

        tab_params = self.req_tabs.add("Params")
        tab_headers = self.req_tabs.add("Headers")
        tab_body = self.req_tabs.add("Body")
        tab_auth = self.req_tabs.add("Auth")
        tab_tests = self.req_tabs.add("Tests")

        self._build_kv_table(tab_params, "params")
        self._build_kv_table(tab_headers, "headers")
        self._build_body_editor(tab_body)
        self._build_auth_editor(tab_auth)
        self._build_tests_editor(tab_tests)

    def _copy_as_curl(self):
        cfg, base_url = self._build_active_request_config()
        curl_cmd = RequestEngine.generate_curl(cfg, {"baseUrl": base_url})
        self.clipboard_clear()
        self.clipboard_append(curl_cmd)
        self._show_status_banner("✓ cURL command copied to clipboard!", is_error=False)

    # -------------------------------------------------------------------------
    # AUTO-EXPANDING KEY-VALUE TABLES WITH DEFAULT EMPTY ROW & 2-WAY SYNC
    # -------------------------------------------------------------------------
    def _build_kv_table(self, parent: ctk.CTkFrame, kind: str):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(2, weight=1)

        ctrl = ctk.CTkFrame(parent, fg_color="transparent")
        ctrl.grid(row=0, column=0, sticky="ew", pady=(0, 4))

        ctk.CTkLabel(
            ctrl,
            text=f"Query {kind.capitalize()}:" if kind == "params" else "HTTP Headers:",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            text_color="#0F172A"
        ).pack(side="left")

        ctk.CTkLabel(
            ctrl,
            text="(Auto-appends new row as you type, or click + Add)",
            font=ctk.CTkFont(family=APP_FONT, size=11),
            text_color="#64748B"
        ).pack(side="left", padx=8)

        btn_add = ctk.CTkButton(
            ctrl,
            text=f"+ Add {kind.capitalize()[:-1] if kind.endswith('s') else kind.capitalize()}",
            width=85,
            height=24,
            corner_radius=6,
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#EFF6FF",
            text_color="#2563EB",
            hover_color="#DBEAFE",
            command=lambda: self._add_kv_row(kind, is_explicit=True)
        )
        btn_add.pack(side="right")

        if kind == "headers":
            ctk.CTkLabel(
                ctrl,
                text="🛡️ System defaults active (User-Agent, Accept: */*)",
                font=ctk.CTkFont(family=APP_FONT, size=11),
                text_color="#10B981"
            ).pack(side="left", padx=4)

            btn_json = ctk.CTkButton(
                ctrl,
                text="+ JSON Headers",
                width=100,
                height=24,
                corner_radius=6,
                font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
                fg_color="#F1F5F9",
                text_color="#334155",
                hover_color="#E2E8F0",
                command=self._add_common_json_headers
            )
            btn_json.pack(side="right", padx=6)

            btn_sys = ctk.CTkButton(
                ctrl,
                text="+ Default Headers",
                width=110,
                height=24,
                corner_radius=6,
                font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
                fg_color="#F1F5F9",
                text_color="#334155",
                hover_color="#E2E8F0",
                command=self._add_default_system_headers
            )
            btn_sys.pack(side="right", padx=(0, 4))

        # TABLE COLUMN HEADER ROW
        tbl_hdr = ctk.CTkFrame(parent, fg_color="#F1F5F9", corner_radius=4, height=24)
        tbl_hdr.grid(row=1, column=0, sticky="ew", pady=(0, 2))
        tbl_hdr.pack_propagate(False)

        ctk.CTkLabel(tbl_hdr, text="", width=26).pack(side="left")
        ctk.CTkLabel(tbl_hdr, text="KEY", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="VALUE", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="DESCRIPTION", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="", width=24).pack(side="right")

        scroll = ctk.CTkScrollableFrame(parent, fg_color="#F8FAFC", corner_radius=6, height=110)
        scroll.grid(row=2, column=0, sticky="nsew")

        # Bottom Add Row Button Bar
        bottom_bar = ctk.CTkFrame(parent, fg_color="transparent")
        bottom_bar.grid(row=3, column=0, sticky="ew", pady=(3, 0))

        btn_bottom_add = ctk.CTkButton(
            bottom_bar,
            text=f"+ Add New {kind.capitalize()[:-1] if kind.endswith('s') else kind.capitalize()}",
            width=120,
            height=22,
            corner_radius=4,
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="transparent",
            text_color="#2563EB",
            hover_color="#EFF6FF",
            anchor="w",
            command=lambda: self._add_kv_row(kind, enabled=False, is_explicit=True)
        )
        btn_bottom_add.pack(side="left")

        if kind == "params":
            self.params_scroll = scroll
            # Ensure at least one default empty row (unchecked by default)
            self._add_kv_row("params", enabled=False)
        else:
            self.headers_scroll = scroll
            # Ensure at least one default empty row (unchecked by default)
            self._add_kv_row("headers", enabled=False)

    def _add_default_system_headers(self):
        """Adds standard browser-compatible headers for quick inspection or modification."""
        self._add_kv_row("headers", "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", description="Modern Browser User-Agent", enabled=True, is_explicit=True)
        self._add_kv_row("headers", "Accept", "*/*", description="Default Accept Any", enabled=True, is_explicit=True)

    def _add_kv_row(self, kind: str, key: str = "", value: str = "", description: str = "", enabled: Optional[bool] = None, is_explicit: bool = False):
        scroll = self.params_scroll if kind == "params" else self.headers_scroll
        rows_list = self.params_rows if kind == "params" else self.headers_rows

        rf = ctk.CTkFrame(scroll, fg_color="transparent")
        rf.pack(fill="x", pady=2, padx=4)

        # Empty boxes are unchecked by default; only checked if key or value has content
        has_content = bool(key.strip() or value.strip())
        if enabled is None:
            actual_enabled = has_content
        else:
            actual_enabled = bool(enabled and has_content) if not is_explicit else bool(enabled)

        en_var = ctk.BooleanVar(value=actual_enabled)
        chk = ctk.CTkCheckBox(rf, text="", variable=en_var, width=20, checkbox_width=16, checkbox_height=16, command=lambda: self._on_kv_modified(kind))
        chk.pack(side="left", padx=(0, 4))

        k_entry = ctk.CTkEntry(rf, placeholder_text="Key", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
        k_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if key:
            k_entry.insert(0, key)

        v_entry = ctk.CTkEntry(rf, placeholder_text="Value", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
        v_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if value:
            v_entry.insert(0, value)

        d_entry = ctk.CTkEntry(rf, placeholder_text="Description", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11), fg_color="#F1F5F9")
        d_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if description:
            d_entry.insert(0, description)

        btn_del = ctk.CTkButton(
            rf,
            text="✕",
            width=24,
            height=24,
            corner_radius=4,
            fg_color="transparent",
            hover_color="#FEE2E2",
            text_color="#EF4444",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            command=lambda r=rf, rl=rows_list, knd=kind: self._remove_kv_row(r, rl, knd)
        )
        btn_del.pack(side="right")

        row_tuple = (rf, en_var, k_entry, v_entry, d_entry)
        rows_list.append(row_tuple)

        # Auto-growing grid: When typing in last row, auto-append another empty row!
        k_entry.bind("<KeyRelease>", lambda e, r=row_tuple, knd=kind: self._on_kv_entry_keyrelease(r, knd))
        v_entry.bind("<KeyRelease>", lambda e, r=row_tuple, knd=kind: self._on_kv_entry_keyrelease(r, knd))
        d_entry.bind("<KeyRelease>", lambda e, r=row_tuple, knd=kind: self._on_kv_entry_keyrelease(r, knd))

        if is_explicit and kind == "params":
            self._sync_params_to_url()

    def _on_kv_entry_keyrelease(self, row_tuple, kind: str):
        rf, en_var, k_entry, v_entry, d_entry = row_tuple
        k_val = k_entry.get().strip()
        v_val = v_entry.get().strip()
        d_val = d_entry.get().strip()
        has_text = bool(k_val or v_val or d_val)

        # Auto-check when user starts typing into an empty row; auto-uncheck if cleared
        if has_text and not en_var.get():
            en_var.set(True)
        elif not has_text and en_var.get():
            en_var.set(False)

        rows_list = self.params_rows if kind == "params" else self.headers_rows
        # If this is the last row and user typed something in key, value or description, auto-append an empty unchecked row!
        if row_tuple == rows_list[-1] and has_text:
            self._add_kv_row(kind, enabled=False)

        self._on_kv_modified(kind)

    def _on_kv_modified(self, kind: str):
        if kind == "params":
            self._sync_params_to_url()

    def _remove_kv_row(self, row_frame, rows_list, kind: str):
        for i, item in enumerate(rows_list):
            if item[0] == row_frame:
                rows_list.pop(i)
                break
        row_frame.destroy()

        # Guarantee at least one empty row always remains (unchecked)
        if not rows_list:
            self._add_kv_row(kind, enabled=False)

        if kind == "params":
            self._sync_params_to_url()

    def _sync_params_to_url(self):
        """Syncs query parameters from the table to the URL input bar."""
        if self._suppress_url_sync:
            return
        curr_url = self.url_entry.get().strip()
        base_part = curr_url.split("?")[0]

        valid_params = []
        for _, en, k, v, _ in self.params_rows:
            key_s = k.get().strip()
            if en.get() and key_s:
                valid_params.append((key_s, v.get().strip()))

        self._suppress_url_sync = True
        self.url_entry.delete(0, "end")
        if valid_params:
            qs = urlencode(valid_params)
            self.url_entry.insert(0, f"{base_part}?{qs}")
        else:
            self.url_entry.insert(0, base_part)
        self._suppress_url_sync = False

    def _on_url_entry_changed(self):
        """When user types/pastes URL with query params (e.g. ?limit=10), updates Params table."""
        if self._suppress_url_sync:
            return
        url_text = self.url_entry.get().strip()
        if "?" not in url_text:
            return

        qs = url_text.split("?", 1)[1]
        pairs = parse_qsl(qs, keep_blank_values=True)
        if not pairs:
            return

        self._suppress_url_sync = True
        # Clear existing params rows
        for r in list(self.params_rows):
            r[0].destroy()
        self.params_rows.clear()

        for k, v in pairs:
            self._add_kv_row("params", k, v, enabled=True)
        # Add trailing empty row
        self._add_kv_row("params")
        self._suppress_url_sync = False

    def _add_common_json_headers(self):
        self._add_kv_row("headers", "Content-Type", "application/json", description="JSON Payload", enabled=True)
        self._add_kv_row("headers", "Accept", "application/json", description="Expected Response", enabled=True)

    # -------------------------------------------------------------------------
    # COMPREHENSIVE BODY EDITOR (form-data, urlencoded, raw, binary, GraphQL)
    # -------------------------------------------------------------------------
    def _build_body_editor(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(1, weight=1)

        # Top Control Bar:
        # ( ) none   ( ) form-data   ( ) x-www-form-urlencoded   (*) raw [ JSON v ]   ( ) binary   ( ) GraphQL       [ 🔍 Find ] [ ✨ Beautify ]
        top_ctrl = ctk.CTkFrame(parent, fg_color="transparent")
        top_ctrl.grid(row=0, column=0, sticky="ew", pady=(0, 4))

        self.body_type_var = ctk.StringVar(value="none")
        self.raw_format_var = ctk.StringVar(value="JSON")
        self.binary_file_path = ""

        body_types = [
            ("none", "none"),
            ("form-data", "form-data"),
            ("x-www-form-urlencoded", "x-www-form-urlencoded"),
            ("raw", "raw"),
            ("binary", "binary"),
            ("GraphQL", "GraphQL")
        ]

        for text, val in body_types:
            r = ctk.CTkRadioButton(
                top_ctrl,
                text=text,
                variable=self.body_type_var,
                value=val,
                font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
                radiobutton_width=14,
                radiobutton_height=14,
                command=self._on_body_type_changed
            )
            r.pack(side="left", padx=(0, 8))

            if val == "raw":
                self.raw_format_menu = ctk.CTkOptionMenu(
                    top_ctrl,
                    values=["JSON", "Text", "JavaScript", "HTML", "XML"],
                    variable=self.raw_format_var,
                    width=85,
                    height=22,
                    font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                    fg_color="#F1F5F9",
                    button_color="#CBD5E1",
                    text_color="#0F172A",
                    command=self._on_raw_format_changed
                )
                self.raw_format_menu.pack(side="left", padx=(0, 8))

        # Beautify button on far right
        self.btn_body_beautify = ctk.CTkButton(
            top_ctrl,
            text="✨ Beautify",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=4,
            height=22,
            width=75,
            command=self._beautify_body_json
        )
        self.btn_body_beautify.pack(side="right")

        # Search / Find button beside Beautify
        self.btn_body_search = ctk.CTkButton(
            top_ctrl,
            text="🔍 Find",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            corner_radius=4,
            height=22,
            width=65,
            command=self._toggle_body_search
        )
        self.btn_body_search.pack(side="right", padx=(0, 4))
        add_tooltip(self.btn_body_search, "Search in Request Body")

        # Container where selected body view is displayed
        self.body_content_container = ctk.CTkFrame(parent, fg_color="transparent")
        self.body_content_container.grid(row=1, column=0, sticky="nsew")
        self.body_content_container.grid_columnconfigure(0, weight=1)
        self.body_content_container.grid_rowconfigure(0, weight=1)

        # 1. NONE view
        self.body_none_view = ctk.CTkFrame(self.body_content_container, fg_color="#F8FAFC", corner_radius=6)
        ctk.CTkLabel(
            self.body_none_view,
            text="This request does not have a body",
            font=ctk.CTkFont(family=APP_FONT, size=11),
            text_color="#94A3B8"
        ).pack(expand=True, pady=30)

        # 2. FORM-DATA view
        self.body_form_data_view = ctk.CTkFrame(self.body_content_container, fg_color="transparent")
        self._build_form_data_table(self.body_form_data_view)

        # 3. X-WWW-FORM-URLENCODED view
        self.body_urlencoded_view = ctk.CTkFrame(self.body_content_container, fg_color="transparent")
        self._build_urlencoded_table(self.body_urlencoded_view)

        # 4. RAW view
        self.body_raw_view = ctk.CTkFrame(self.body_content_container, fg_color="transparent")
        self.body_raw_view.grid_columnconfigure(0, weight=1)
        self.body_raw_view.grid_rowconfigure(1, weight=1)
        self.body_textbox = ctk.CTkTextbox(
            self.body_raw_view,
            font=ctk.CTkFont(family="Consolas", size=12),
            fg_color="#F8FAFC",
            text_color="#0F172A",
            border_color="#CBD5E1",
            border_width=1,
            corner_radius=6,
            wrap="none",
            height=320
        )
        self.body_textbox.grid(row=1, column=0, sticky="nsew")

        # Setup JSON syntax highlighting tags & live typing listener
        JSONSyntaxHighlighter.setup_tags(self.body_textbox)
        self.body_textbox.bind("<KeyRelease>", self._on_body_textbox_key)
        self._bind_smart_mousewheel(self.body_textbox)
        self._bind_smart_mousewheel(self.body_raw_view)

        # Integrated Search Bar for Request Body
        self.body_search_bar = TextSearchBar(self.body_raw_view, self.body_textbox, on_close=self._on_body_search_closed)

        # 5. BINARY view
        self.body_binary_view = ctk.CTkFrame(self.body_content_container, fg_color="#F8FAFC", corner_radius=6)
        self._build_binary_picker(self.body_binary_view)

        # 6. GRAPHQL view
        self.body_graphql_view = ctk.CTkFrame(self.body_content_container, fg_color="transparent")
        self._build_graphql_editor(self.body_graphql_view)

        # Initial view
        self._on_body_type_changed()

    def _toggle_body_search(self):
        if self.body_search_bar and getattr(self.body_search_bar, "is_open", False):
            self.body_search_bar.close()
        elif self.body_search_bar:
            self.body_search_bar.open_search(row=0, sticky="e")
            self.btn_body_search.configure(fg_color="#DBEAFE", text_color="#1D4ED8")

    def _on_body_search_closed(self):
        if hasattr(self, "btn_body_search"):
            self.btn_body_search.configure(fg_color="#F1F5F9", text_color="#334155")

    def _on_body_textbox_key(self, event=None):
        if getattr(self, "_body_highlight_job", None):
            try:
                self.after_cancel(self._body_highlight_job)
            except Exception:
                pass
        self._body_highlight_job = self.after(350, lambda: JSONSyntaxHighlighter.highlight(self.body_textbox))

    def _on_body_type_changed(self):
        btype = self.body_type_var.get()
        # Hide all views
        for v in (self.body_none_view, self.body_form_data_view, self.body_urlencoded_view, self.body_raw_view, self.body_binary_view, self.body_graphql_view):
            v.grid_forget()

        if btype not in ["raw", "json", "text"] and self.body_search_bar:
            self.body_search_bar.close()

        # Show selected view
        if btype == "none":
            self.body_none_view.grid(row=0, column=0, sticky="nsew")
            self.raw_format_menu.configure(state="disabled")
            self.btn_body_beautify.configure(state="disabled")
            self.btn_body_search.configure(state="disabled")
        elif btype == "form-data":
            self.body_form_data_view.grid(row=0, column=0, sticky="nsew")
            self.raw_format_menu.configure(state="disabled")
            self.btn_body_beautify.configure(state="disabled")
            self.btn_body_search.configure(state="disabled")
        elif btype == "x-www-form-urlencoded":
            self.body_urlencoded_view.grid(row=0, column=0, sticky="nsew")
            self.raw_format_menu.configure(state="disabled")
            self.btn_body_beautify.configure(state="disabled")
            self.btn_body_search.configure(state="disabled")
        elif btype in ["raw", "json", "text"]:
            self.body_raw_view.grid(row=0, column=0, sticky="nsew")
            self.raw_format_menu.configure(state="normal")
            self.btn_body_beautify.configure(state="normal")
            self.btn_body_search.configure(state="normal")
            JSONSyntaxHighlighter.highlight(self.body_textbox)
        elif btype == "binary":
            self.body_binary_view.grid(row=0, column=0, sticky="nsew")
            self.raw_format_menu.configure(state="disabled")
            self.btn_body_beautify.configure(state="disabled")
            self.btn_body_search.configure(state="disabled")
        elif btype == "GraphQL":
            self.body_graphql_view.grid(row=0, column=0, sticky="nsew")
            self.raw_format_menu.configure(state="disabled")
            self.btn_body_beautify.configure(state="normal")
            self.btn_body_search.configure(state="disabled")

    def _on_raw_format_changed(self, fmt: str):
        # Auto-suggest or set Content-Type header if user changes raw format
        pass

    def _beautify_body_json(self):
        btype = self.body_type_var.get()
        if btype == "GraphQL" and hasattr(self, "graphql_vars_box"):
            raw = self.graphql_vars_box.get("1.0", "end-1c").strip()
            if raw:
                try:
                    formatted = json.dumps(json.loads(raw), indent=2)
                    self.graphql_vars_box.delete("1.0", "end")
                    self.graphql_vars_box.insert("1.0", formatted)
                except Exception:
                    pass
            return

        raw = self.body_textbox.get("1.0", "end-1c").strip()
        if not raw:
            return
        fmt = self.raw_format_var.get()
        if fmt == "JSON" or btype == "json":
            try:
                parsed = json.loads(raw)
                formatted = json.dumps(parsed, indent=2)
                self.body_textbox.delete("1.0", "end")
                self.body_textbox.insert("1.0", formatted)
                self.body_type_var.set("raw")
                JSONSyntaxHighlighter.highlight(self.body_textbox)
            except Exception:
                pass
        elif fmt in ["XML", "HTML"]:
            try:
                import xml.dom.minidom
                dom = xml.dom.minidom.parseString(raw)
                self.body_textbox.delete("1.0", "end")
                self.body_textbox.insert("1.0", dom.toprettyxml())
            except Exception:
                pass

    # -------------------------------------------------------------------------
    # FORM-DATA TABLE (INPUT TYPES: TEXT / FILE PICKER)
    # -------------------------------------------------------------------------
    def _build_form_data_table(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(1, weight=1)

        tbl_hdr = ctk.CTkFrame(parent, fg_color="#F1F5F9", corner_radius=4, height=24)
        tbl_hdr.grid(row=0, column=0, sticky="ew", pady=(0, 2))
        tbl_hdr.pack_propagate(False)

        ctk.CTkLabel(tbl_hdr, text="", width=26).pack(side="left")
        ctk.CTkLabel(tbl_hdr, text="KEY", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="TYPE", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", width=70, anchor="w").pack(side="left", padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="VALUE", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="DESCRIPTION", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="", width=24).pack(side="right")

        self.form_data_scroll = ctk.CTkScrollableFrame(parent, fg_color="#F8FAFC", corner_radius=6, height=110)
        self.form_data_scroll.grid(row=1, column=0, sticky="nsew")

        # Bottom Add Row Bar
        bottom_bar = ctk.CTkFrame(parent, fg_color="transparent")
        bottom_bar.grid(row=2, column=0, sticky="ew", pady=(3, 0))

        btn_add = ctk.CTkButton(
            bottom_bar,
            text="+ Add Form Field",
            width=120,
            height=22,
            corner_radius=4,
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="transparent",
            text_color="#2563EB",
            hover_color="#EFF6FF",
            anchor="w",
            command=lambda: self._add_form_data_row()
        )
        btn_add.pack(side="left")

        self.form_data_rows = []
        self._add_form_data_row(enabled=False)

    def _add_form_data_row(self, key="", val="", field_type="Text", description="", enabled: Optional[bool] = None):
        rf = ctk.CTkFrame(self.form_data_scroll, fg_color="transparent")
        rf.pack(fill="x", pady=2, padx=4)

        has_content = bool(key.strip() or (isinstance(val, str) and val.strip()))
        if enabled is None:
            actual_enabled = has_content
        else:
            actual_enabled = bool(enabled and has_content)

        en_var = ctk.BooleanVar(value=actual_enabled)
        chk = ctk.CTkCheckBox(rf, text="", variable=en_var, width=20, checkbox_width=16, checkbox_height=16)
        chk.pack(side="left", padx=(0, 4))

        k_entry = ctk.CTkEntry(rf, placeholder_text="Key", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
        k_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if key:
            k_entry.insert(0, key)

        type_var = ctk.StringVar(value=field_type)
        val_holder = {"val": val, "entry": None}

        # Value container that switches between text input and file chooser
        v_container = ctk.CTkFrame(rf, fg_color="transparent")

        d_entry = ctk.CTkEntry(rf, placeholder_text="Description", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11), fg_color="#F1F5F9")
        if description:
            d_entry.insert(0, description)

        btn_del = ctk.CTkButton(
            rf, text="✕", width=24, height=24, corner_radius=4, fg_color="transparent",
            hover_color="#FEE2E2", text_color="#EF4444", font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            command=lambda: self._remove_form_data_row(rf)
        )

        def _render_val_widget():
            for child in v_container.winfo_children():
                child.destroy()
            if type_var.get() == "File":
                cur_file = val_holder["val"]
                fname = os.path.basename(cur_file) if cur_file else "Select Files..."
                btn_pick = ctk.CTkButton(
                    v_container,
                    text=f"📁 {fname}",
                    height=24,
                    corner_radius=4,
                    font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                    fg_color="#EFF6FF",
                    hover_color="#DBEAFE",
                    text_color="#2563EB",
                    command=lambda: _pick_file()
                )
                btn_pick.pack(side="left", fill="x", expand=True)
                if cur_file:
                    btn_clr = ctk.CTkButton(
                        v_container,
                        text="✕",
                        width=18,
                        height=20,
                        fg_color="transparent",
                        hover_color="#FEE2E2",
                        text_color="#EF4444",
                        command=lambda: _clear_file()
                    )
                    btn_clr.pack(side="right", padx=(2, 0))
            else:
                entry = ctk.CTkEntry(v_container, placeholder_text="Value", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
                entry.pack(side="left", fill="x", expand=True)
                if val_holder["val"]:
                    entry.insert(0, str(val_holder["val"]))
                val_holder["entry"] = entry
                entry.bind("<KeyRelease>", lambda e: self._check_form_data_auto_append())

        def _pick_file():
            from tkinter import filedialog
            chosen = filedialog.askopenfilename(title="Select File for Form Data")
            if chosen:
                val_holder["val"] = chosen
                _render_val_widget()
                self._check_form_data_auto_append()

        def _clear_file():
            val_holder["val"] = ""
            _render_val_widget()

        type_menu = ctk.CTkOptionMenu(
            rf,
            values=["Text", "File"],
            variable=type_var,
            width=70,
            height=26,
            corner_radius=4,
            font=ctk.CTkFont(family=APP_FONT, size=11),
            fg_color="#F1F5F9",
            button_color="#CBD5E1",
            text_color="#0F172A",
            command=lambda v: _render_val_widget()
        )
        type_menu.pack(side="left", padx=(0, 4))
        v_container.pack(side="left", fill="x", expand=True, padx=(0, 4))
        d_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        btn_del.pack(side="right")

        _render_val_widget()
        k_entry.bind("<KeyRelease>", lambda e: self._check_form_data_auto_append())
        d_entry.bind("<KeyRelease>", lambda e: self._check_form_data_auto_append())

        self.form_data_rows.append((rf, en_var, k_entry, type_var, val_holder, d_entry))

    def _check_form_data_auto_append(self):
        if not self.form_data_rows:
            return
        # Sync checkbox: auto-check if user typed text; auto-uncheck if empty
        for r_item in self.form_data_rows:
            rf, en, k_e, t_v, v_h, d_e = r_item
            k_txt = k_e.get().strip()
            v_txt = v_h["entry"].get().strip() if (t_v.get() == "Text" and v_h.get("entry")) else str(v_h.get("val", "")).strip()
            d_txt = d_e.get().strip()
            has_txt = bool(k_txt or v_txt or d_txt)
            if has_txt and not en.get():
                en.set(True)
            elif not has_txt and en.get():
                en.set(False)

        last_rf, last_en, last_k, last_t, last_vh, last_d = self.form_data_rows[-1]
        k_txt = last_k.get().strip()
        v_txt = last_vh["entry"].get().strip() if (last_t.get() == "Text" and last_vh.get("entry")) else str(last_vh.get("val", "")).strip()
        d_txt = last_d.get().strip()
        if k_txt or v_txt or d_txt:
            self._add_form_data_row(enabled=False)

    def _remove_form_data_row(self, row_frame):
        if len(self.form_data_rows) <= 1:
            # Clear row
            rf, en, k, t, vh, d = self.form_data_rows[0]
            k.delete(0, "end")
            d.delete(0, "end")
            if vh.get("entry"):
                vh["entry"].delete(0, "end")
            vh["val"] = ""
            en.set(False)
            return
        for item in list(self.form_data_rows):
            if item[0] == row_frame:
                item[0].destroy()
                self.form_data_rows.remove(item)
                break

    # -------------------------------------------------------------------------
    # X-WWW-FORM-URLENCODED TABLE
    # -------------------------------------------------------------------------
    def _build_urlencoded_table(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(1, weight=1)

        tbl_hdr = ctk.CTkFrame(parent, fg_color="#F1F5F9", corner_radius=4, height=24)
        tbl_hdr.grid(row=0, column=0, sticky="ew", pady=(0, 2))
        tbl_hdr.pack_propagate(False)

        ctk.CTkLabel(tbl_hdr, text="", width=26).pack(side="left")
        ctk.CTkLabel(tbl_hdr, text="KEY", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="VALUE", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="DESCRIPTION", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="", width=24).pack(side="right")

        self.urlencoded_scroll = ctk.CTkScrollableFrame(parent, fg_color="#F8FAFC", corner_radius=6, height=110)
        self.urlencoded_scroll.grid(row=1, column=0, sticky="nsew")

        bottom_bar = ctk.CTkFrame(parent, fg_color="transparent")
        bottom_bar.grid(row=2, column=0, sticky="ew", pady=(3, 0))

        btn_add = ctk.CTkButton(
            bottom_bar,
            text="+ Add Urlencoded Row",
            width=140,
            height=22,
            corner_radius=4,
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="transparent",
            text_color="#2563EB",
            hover_color="#EFF6FF",
            anchor="w",
            command=lambda: self._add_urlencoded_row(enabled=False)
        )
        btn_add.pack(side="left")

        self.urlencoded_rows = []
        self._add_urlencoded_row(enabled=False)

    def _add_urlencoded_row(self, key="", val="", description="", enabled: Optional[bool] = None):
        rf = ctk.CTkFrame(self.urlencoded_scroll, fg_color="transparent")
        rf.pack(fill="x", pady=2, padx=4)

        has_content = bool(key.strip() or val.strip())
        if enabled is None:
            actual_enabled = has_content
        else:
            actual_enabled = bool(enabled and has_content)

        en_var = ctk.BooleanVar(value=actual_enabled)
        chk = ctk.CTkCheckBox(rf, text="", variable=en_var, width=20, checkbox_width=16, checkbox_height=16)
        chk.pack(side="left", padx=(0, 4))

        k_entry = ctk.CTkEntry(rf, placeholder_text="Key", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
        k_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if key:
            k_entry.insert(0, key)

        v_entry = ctk.CTkEntry(rf, placeholder_text="Value", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
        v_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if val:
            v_entry.insert(0, val)

        d_entry = ctk.CTkEntry(rf, placeholder_text="Description", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11), fg_color="#F1F5F9")
        d_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if description:
            d_entry.insert(0, description)

        btn_del = ctk.CTkButton(
            rf, text="✕", width=24, height=24, corner_radius=4, fg_color="transparent",
            hover_color="#FEE2E2", text_color="#EF4444", font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            command=lambda: self._remove_urlencoded_row(rf)
        )
        btn_del.pack(side="right")

        k_entry.bind("<KeyRelease>", lambda e: self._check_urlencoded_auto_append())
        v_entry.bind("<KeyRelease>", lambda e: self._check_urlencoded_auto_append())
        d_entry.bind("<KeyRelease>", lambda e: self._check_urlencoded_auto_append())

        self.urlencoded_rows.append((rf, en_var, k_entry, v_entry, d_entry))

    def _check_urlencoded_auto_append(self):
        if not self.urlencoded_rows:
            return
        # Sync checkbox: auto-check if user typed text; auto-uncheck if empty
        for r_item in self.urlencoded_rows:
            rf, en, k_e, v_e, d_e = r_item
            has_txt = bool(k_e.get().strip() or v_e.get().strip() or d_e.get().strip())
            if has_txt and not en.get():
                en.set(True)
            elif not has_txt and en.get():
                en.set(False)

        last_rf, last_en, last_k, last_v, last_d = self.urlencoded_rows[-1]
        if last_k.get().strip() or last_v.get().strip() or last_d.get().strip():
            self._add_urlencoded_row(enabled=False)

    def _remove_urlencoded_row(self, row_frame):
        if len(self.urlencoded_rows) <= 1:
            rf, en, k, v, d = self.urlencoded_rows[0]
            k.delete(0, "end")
            v.delete(0, "end")
            d.delete(0, "end")
            en.set(False)
            return
            return
        for item in list(self.urlencoded_rows):
            if item[0] == row_frame:
                item[0].destroy()
                self.urlencoded_rows.remove(item)
                break

    # -------------------------------------------------------------------------
    # BINARY BODY PICKER
    # -------------------------------------------------------------------------
    def _build_binary_picker(self, parent: ctk.CTkFrame):
        p = ctk.CTkFrame(parent, fg_color="transparent")
        p.pack(expand=True, fill="both", padx=20, pady=20)

        ctk.CTkLabel(
            p,
            text="Select a file to send as binary data in the request body:",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#475569"
        ).pack(anchor="w", pady=(0, 8))

        row = ctk.CTkFrame(p, fg_color="transparent")
        row.pack(fill="x")

        self.btn_pick_binary = ctk.CTkButton(
            row,
            text="📁 Select File",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#2563EB",
            hover_color="#1D4ED8",
            height=28,
            command=self._on_pick_binary_file
        )
        self.btn_pick_binary.pack(side="left", padx=(0, 8))

        self.lbl_binary_info = ctk.CTkLabel(
            row,
            text="No file selected",
            font=ctk.CTkFont(family=APP_FONT, size=11),
            text_color="#64748B"
        )
        self.lbl_binary_info.pack(side="left", fill="x", expand=True)

        self.btn_clear_binary = ctk.CTkButton(
            row,
            text="✕ Clear",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#FEE2E2",
            text_color="#EF4444",
            height=26,
            width=60,
            command=self._on_clear_binary_file
        )
        self.btn_clear_binary.pack(side="right")

    def _on_pick_binary_file(self):
        from tkinter import filedialog
        path = filedialog.askopenfilename(title="Select Binary Request Body")
        if path:
            self.binary_file_path = path
            fname = os.path.basename(path)
            fsize = os.path.getsize(path)
            sz_str = f"{fsize/1024:.1f} KB" if fsize >= 1024 else f"{fsize} B"
            self.lbl_binary_info.configure(text=f"📄 {fname} ({sz_str}) - {path}", text_color="#0F172A")

    def _on_clear_binary_file(self):
        self.binary_file_path = ""
        self.lbl_binary_info.configure(text="No file selected", text_color="#64748B")

    # -------------------------------------------------------------------------
    # GRAPHQL QUERY & VARIABLES EDITOR
    # -------------------------------------------------------------------------
    def _build_graphql_editor(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(1, weight=3)
        parent.grid_rowconfigure(3, weight=2)

        ctk.CTkLabel(
            parent,
            text="QUERY",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            text_color="#64748B"
        ).grid(row=0, column=0, sticky="w", pady=(2, 2))

        self.graphql_query_box = ctk.CTkTextbox(
            parent,
            font=ctk.CTkFont(family="Consolas", size=11),
            fg_color="#F8FAFC",
            text_color="#0F172A",
            border_color="#CBD5E1",
            border_width=1,
            corner_radius=6,
            wrap="none",
            height=70
        )
        self.graphql_query_box.grid(row=1, column=0, sticky="nsew", pady=(0, 4))

        ctk.CTkLabel(
            parent,
            text="GRAPHQL VARIABLES (JSON)",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            text_color="#64748B"
        ).grid(row=2, column=0, sticky="w", pady=(2, 2))

        self.graphql_vars_box = ctk.CTkTextbox(
            parent,
            font=ctk.CTkFont(family="Consolas", size=11),
            fg_color="#F8FAFC",
            text_color="#0F172A",
            border_color="#CBD5E1",
            border_width=1,
            corner_radius=6,
            wrap="none",
            height=45
        )
        self.graphql_vars_box.grid(row=3, column=0, sticky="nsew")

    # -------------------------------------------------------------------------
    # AUTHORIZATION TAB (Bearer, API Key, Basic, OAuth 2.0, Digest, AWS)
    # -------------------------------------------------------------------------
    def _build_auth_editor(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)

        ctrl = ctk.CTkFrame(parent, fg_color="transparent")
        ctrl.pack(fill="x", pady=(2, 6))

        ctk.CTkLabel(
            ctrl,
            text="Auth Type:",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#64748B"
        ).pack(side="left", padx=(0, 8))

        self.auth_type_var = ctk.StringVar(value="No Auth")
        auth_choices = ["No Auth", "Bearer Token", "API Key", "Basic Auth", "OAuth 2.0", "Digest Auth", "AWS Signature"]
        m = ctk.CTkOptionMenu(
            ctrl,
            values=auth_choices,
            variable=self.auth_type_var,
            width=140,
            height=26,
            corner_radius=6,
            fg_color="#F1F5F9",
            button_color="#CBD5E1",
            text_color="#0F172A",
            font=ctk.CTkFont(family=APP_FONT, size=11),
            command=lambda v: self._render_auth_fields()
        )
        m.pack(side="left")

        self.auth_container = ctk.CTkFrame(parent, fg_color="#F8FAFC", corner_radius=6)
        self.auth_container.pack(fill="both", expand=True, padx=2, pady=2)
        self._render_auth_fields()

    def _render_auth_fields(self):
        for w in self.auth_container.winfo_children():
            w.destroy()

        t = self.auth_type_var.get()
        if t in ["none", "No Auth"]:
            c = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            c.pack(expand=True, pady=24)
            ctk.CTkLabel(c, text="🔒 No Auth", font=ctk.CTkFont(family=APP_FONT, size=13, weight="bold"), text_color="#64748B").pack()
            ctk.CTkLabel(c, text="This request does not use any authorization.", font=ctk.CTkFont(family=APP_FONT, size=11), text_color="#94A3B8").pack(pady=4)

        elif t in ["bearer", "Bearer Token"]:
            row = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            row.pack(fill="x", padx=14, pady=12)
            ctk.CTkLabel(row, text="Token:", width=70, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_token_entry = ctk.CTkEntry(row, placeholder_text="Token (e.g. eyJhbGciOi...)", height=28)
            self.auth_token_entry.pack(side="left", fill="x", expand=True)

        elif t in ["basic", "Basic Auth"]:
            r1 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r1.pack(fill="x", padx=14, pady=(10, 3))
            ctk.CTkLabel(r1, text="Username:", width=75, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_user_entry = ctk.CTkEntry(r1, placeholder_text="Username", height=28)
            self.auth_user_entry.pack(side="left", fill="x", expand=True)

            r2 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r2.pack(fill="x", padx=14, pady=(3, 10))
            ctk.CTkLabel(r2, text="Password:", width=75, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_pass_entry = ctk.CTkEntry(r2, placeholder_text="Password", show="•", height=28)
            self.auth_pass_entry.pack(side="left", fill="x", expand=True)

        elif t in ["apikey", "API Key"]:
            r1 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r1.pack(fill="x", padx=14, pady=(10, 3))
            ctk.CTkLabel(r1, text="Key:", width=75, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_apikey_k = ctk.CTkEntry(r1, placeholder_text="Key name (e.g. X-API-Key)", height=28)
            self.auth_apikey_k.pack(side="left", fill="x", expand=True)

            r2 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r2.pack(fill="x", padx=14, pady=(3, 3))
            ctk.CTkLabel(r2, text="Value:", width=75, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_apikey_v = ctk.CTkEntry(r2, placeholder_text="Key value", height=28)
            self.auth_apikey_v.pack(side="left", fill="x", expand=True)

            r3 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r3.pack(fill="x", padx=14, pady=(3, 10))
            ctk.CTkLabel(r3, text="Add to:", width=75, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_apikey_target = ctk.StringVar(value="Header")
            ctk.CTkOptionMenu(r3, values=["Header", "Query Params"], variable=self.auth_apikey_target, width=130, height=26).pack(side="left")

        elif t in ["oauth2", "OAuth 2.0"]:
            r1 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r1.pack(fill="x", padx=14, pady=(10, 3))
            ctk.CTkLabel(r1, text="Access Token:", width=95, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_token_entry = ctk.CTkEntry(r1, placeholder_text="Access Token...", height=28)
            self.auth_token_entry.pack(side="left", fill="x", expand=True)

            r2 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r2.pack(fill="x", padx=14, pady=(3, 10))
            ctk.CTkLabel(r2, text="Header Prefix:", width=95, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_oauth_prefix = ctk.CTkEntry(r2, placeholder_text="Bearer", height=28)
            self.auth_oauth_prefix.insert(0, "Bearer")
            self.auth_oauth_prefix.pack(side="left", width=120)

        elif t in ["digest", "Digest Auth"]:
            r1 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r1.pack(fill="x", padx=14, pady=(10, 3))
            ctk.CTkLabel(r1, text="Username:", width=75, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_user_entry = ctk.CTkEntry(r1, placeholder_text="Username", height=28)
            self.auth_user_entry.pack(side="left", fill="x", expand=True)

            r2 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r2.pack(fill="x", padx=14, pady=(3, 10))
            ctk.CTkLabel(r2, text="Password:", width=75, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_pass_entry = ctk.CTkEntry(r2, placeholder_text="Password", show="•", height=28)
            self.auth_pass_entry.pack(side="left", fill="x", expand=True)

        elif t in ["aws", "AWS Signature"]:
            r1 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r1.pack(fill="x", padx=14, pady=(6, 2))
            ctk.CTkLabel(r1, text="AccessKey:", width=85, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_aws_key = ctk.CTkEntry(r1, placeholder_text="AccessKeyId", height=26)
            self.auth_aws_key.pack(side="left", fill="x", expand=True)

            r2 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r2.pack(fill="x", padx=14, pady=2)
            ctk.CTkLabel(r2, text="SecretKey:", width=85, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_aws_secret = ctk.CTkEntry(r2, placeholder_text="SecretAccessKey", show="•", height=26)
            self.auth_aws_secret.pack(side="left", fill="x", expand=True)

            r3 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r3.pack(fill="x", padx=14, pady=2)
            ctk.CTkLabel(r3, text="Region:", width=85, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_aws_region = ctk.CTkEntry(r3, placeholder_text="us-east-1", height=26)
            self.auth_aws_region.pack(side="left", fill="x", expand=True)

            r4 = ctk.CTkFrame(self.auth_container, fg_color="transparent")
            r4.pack(fill="x", padx=14, pady=(2, 6))
            ctk.CTkLabel(r4, text="Service:", width=85, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left")
            self.auth_aws_service = ctk.CTkEntry(r4, placeholder_text="s3 / execute-api", height=26)
            self.auth_aws_service.pack(side="left", fill="x", expand=True)

    # -------------------------------------------------------------------------
    # TEST ASSERTIONS SUITE (ALL TEST TYPES & QUICK SNIPPETS)
    # -------------------------------------------------------------------------
    def _build_tests_editor(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(3, weight=1)

        # 1. Quick Snippets Bar
        snip_bar = ctk.CTkFrame(parent, fg_color="transparent")
        snip_bar.grid(row=0, column=0, sticky="ew", pady=(0, 4))

        ctk.CTkLabel(
            snip_bar,
            text="⚡ Snippets:",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#64748B"
        ).pack(side="left", padx=(0, 6))

        snippets = [
            ("+ Status 200", "status_code", "", "200"),
            ("+ Status 2xx", "status_code", "", "2xx"),
            ("+ Time < 500ms", "response_time", "", "500"),
            ("+ Valid JSON", "body_is_json", "", ""),
            ("+ Header Check", "header_contains", "Content-Type", "application/json"),
            ("+ Body Contains", "body_contains", "", "success"),
            ("+ JSON Key", "json_key", "data.id", ""),
            ("+ JSON Value", "json_value", "status", "success"),
            ("+ Extract {{token}}", "extract_var", "token", "token"),
        ]

        for label, stype, stgt, sval in snippets:
            btn_s = ctk.CTkButton(
                snip_bar,
                text=label,
                font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                fg_color="#EFF6FF",
                hover_color="#DBEAFE",
                text_color="#2563EB",
                corner_radius=4,
                height=22,
                command=lambda t=stype, tg=stgt, v=sval: self._add_test_row(t, tg, v, True)
            )
            btn_s.pack(side="left", padx=2)

        # 2. Control Header
        ctrl = ctk.CTkFrame(parent, fg_color="transparent")
        ctrl.grid(row=1, column=0, sticky="ew", pady=(2, 4))

        ctk.CTkLabel(
            ctrl,
            text="Active Test Assertions (Evaluated automatically on response):",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#0F172A"
        ).pack(side="left")

        btn_add_test = ctk.CTkButton(
            ctrl,
            text="+ Add Assertion",
            width=100,
            height=22,
            corner_radius=4,
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#EFF6FF",
            text_color="#2563EB",
            hover_color="#DBEAFE",
            command=lambda: self._add_test_row("status_code", "", "200", True)
        )
        btn_add_test.pack(side="right")

        # 3. Column Header
        tbl_hdr = ctk.CTkFrame(parent, fg_color="#F1F5F9", corner_radius=4, height=24)
        tbl_hdr.grid(row=2, column=0, sticky="ew", pady=(0, 2))
        tbl_hdr.pack_propagate(False)

        ctk.CTkLabel(tbl_hdr, text="", width=26).pack(side="left")
        ctk.CTkLabel(tbl_hdr, text="ASSERTION TYPE", width=160, font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="TARGET / PATH / HEADER", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="EXPECTED VALUE / VARIABLE", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkLabel(tbl_hdr, text="", width=24).pack(side="right")

        # 4. Scrollable Test Rows
        self.tests_scroll = ctk.CTkScrollableFrame(parent, fg_color="#F8FAFC", corner_radius=6, height=110)
        self.tests_scroll.grid(row=3, column=0, sticky="nsew")

        # Default tests
        self._clear_test_rows()
        self._add_test_row("status_code", "", "200", True)
        self._add_test_row("response_time", "", "500", True)

    def _clear_test_rows(self):
        if hasattr(self, "tests_scroll"):
            for w in self.tests_scroll.winfo_children():
                w.destroy()
        self.test_rows.clear()

    def _remove_test_row(self, row_frame):
        for i, item in enumerate(self.test_rows):
            if item[0] == row_frame:
                self.test_rows.pop(i)
                break
        row_frame.destroy()

    def _add_test_row(self, test_type: str = "status_code", target: str = "", value: str = "200", enabled: bool = True):
        rf = ctk.CTkFrame(self.tests_scroll, fg_color="transparent")
        rf.pack(fill="x", pady=2, padx=4)

        en_var = ctk.BooleanVar(value=enabled)
        chk = ctk.CTkCheckBox(rf, text="", variable=en_var, width=20, checkbox_width=16, checkbox_height=16)
        chk.pack(side="left", padx=(0, 4))

        type_options = [
            "Status Code",
            "Response Time (< ms)",
            "Valid JSON",
            "Header Exists",
            "Header Contains",
            "Body Contains",
            "Body Not Contains",
            "JSON Key Exists",
            "JSON Value Equals",
            "JSON Array Not Empty",
            "Extract Variable"
        ]
        type_display_map = {
            "status_code": "Status Code",
            "response_time": "Response Time (< ms)",
            "body_is_json": "Valid JSON",
            "header_exists": "Header Exists",
            "header_contains": "Header Contains",
            "body_contains": "Body Contains",
            "body_not_contains": "Body Not Contains",
            "json_key": "JSON Key Exists",
            "json_key_exists": "JSON Key Exists",
            "json_check": "JSON Key Exists",
            "json_value": "JSON Value Equals",
            "json_value_equals": "JSON Value Equals",
            "json_array_not_empty": "JSON Array Not Empty",
            "extract_var": "Extract Variable",
            "extract_variable": "Extract Variable",
        }
        disp_type = type_display_map.get(test_type, test_type if test_type in type_options else "Status Code")
        type_var = ctk.StringVar(value=disp_type)

        type_menu = ctk.CTkOptionMenu(
            rf,
            values=type_options,
            variable=type_var,
            width=160,
            height=26,
            corner_radius=4,
            font=ctk.CTkFont(family=APP_FONT, size=11),
            fg_color="#F1F5F9",
            button_color="#CBD5E1",
            text_color="#0F172A"
        )
        type_menu.pack(side="left", padx=(0, 4))

        target_entry = ctk.CTkEntry(rf, placeholder_text="Target (Path/Header)", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
        target_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if target:
            target_entry.insert(0, target)

        value_entry = ctk.CTkEntry(rf, placeholder_text="Expected Value", height=26, corner_radius=4, font=ctk.CTkFont(family=APP_FONT, size=11))
        value_entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        if value:
            value_entry.insert(0, value)

        btn_del = ctk.CTkButton(
            rf,
            text="✕",
            width=24,
            height=24,
            corner_radius=4,
            fg_color="transparent",
            hover_color="#FEE2E2",
            text_color="#EF4444",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            command=lambda r=rf: self._remove_test_row(r)
        )
        btn_del.pack(side="right")

        def _update_placeholders(selected_type):
            if selected_type == "Status Code":
                target_entry.configure(placeholder_text="(Empty)")
                value_entry.configure(placeholder_text="e.g. 200 or 2xx")
            elif selected_type == "Response Time (< ms)":
                target_entry.configure(placeholder_text="(Empty)")
                value_entry.configure(placeholder_text="Max ms (e.g. 500)")
            elif selected_type == "Valid JSON":
                target_entry.configure(placeholder_text="(Empty)")
                value_entry.configure(placeholder_text="(Empty)")
            elif selected_type == "Header Exists":
                target_entry.configure(placeholder_text="Header Name (e.g. Content-Type)")
                value_entry.configure(placeholder_text="(Empty)")
            elif selected_type == "Header Contains":
                target_entry.configure(placeholder_text="Header Name")
                value_entry.configure(placeholder_text="Substring (e.g. application/json)")
            elif selected_type in ["Body Contains", "Body Not Contains"]:
                target_entry.configure(placeholder_text="(Empty)")
                value_entry.configure(placeholder_text="Text to search in body")
            elif selected_type == "JSON Key Exists":
                target_entry.configure(placeholder_text="Path (e.g. data.id or token)")
                value_entry.configure(placeholder_text="(Empty)")
            elif selected_type == "JSON Value Equals":
                target_entry.configure(placeholder_text="Path (e.g. status or code)")
                value_entry.configure(placeholder_text="Expected value (e.g. success)")
            elif selected_type == "JSON Array Not Empty":
                target_entry.configure(placeholder_text="Array path (e.g. items)")
                value_entry.configure(placeholder_text="(Empty)")
            elif selected_type == "Extract Variable":
                target_entry.configure(placeholder_text="JSON Path (e.g. access_token)")
                value_entry.configure(placeholder_text="Variable Name (e.g. token)")

        type_menu.configure(command=_update_placeholders)
        _update_placeholders(disp_type)

        self.test_rows.append((rf, en_var, type_var, target_entry, value_entry))

    def _gather_tests(self) -> List[Dict[str, Any]]:
        type_internal_map = {
            "Status Code": "status_code",
            "Response Time (< ms)": "response_time",
            "Valid JSON": "body_is_json",
            "Header Exists": "header_exists",
            "Header Contains": "header_contains",
            "Body Contains": "body_contains",
            "Body Not Contains": "body_not_contains",
            "JSON Key Exists": "json_key",
            "JSON Value Equals": "json_value",
            "JSON Array Not Empty": "json_array_not_empty",
            "Extract Variable": "extract_var",
        }
        tests = []
        for rf, en_var, type_var, target_entry, value_entry in self.test_rows:
            disp_type = type_var.get()
            int_type = type_internal_map.get(disp_type, "status_code")
            target_val = target_entry.get().strip()
            val = value_entry.get().strip()
            if disp_type == "Status Code":
                name = f"Status code is {val or '200'}"
            elif disp_type == "Response Time (< ms)":
                name = f"Response time < {val or '500'} ms"
            elif disp_type == "Valid JSON":
                name = "Body is valid JSON"
            elif disp_type == "Header Exists":
                name = f"Header '{target_val}' exists"
            elif disp_type == "Header Contains":
                name = f"Header '{target_val}' contains '{val}'"
            elif disp_type == "Body Contains":
                name = f"Body contains '{val}'"
            elif disp_type == "Body Not Contains":
                name = f"Body does not contain '{val}'"
            elif disp_type == "JSON Key Exists":
                name = f"JSON has key '{target_val}'"
            elif disp_type == "JSON Value Equals":
                name = f"JSON '{target_val}' == '{val}'"
            elif disp_type == "JSON Array Not Empty":
                name = f"Array '{target_val or 'root'}' not empty"
            elif disp_type == "Extract Variable":
                name = f"Extract {{{{{val or target_val}}}}} from '{target_val}'"
            else:
                name = f"{disp_type}"

            tests.append({
                "type": int_type,
                "target": target_val,
                "value": val,
                "name": name,
                "enabled": en_var.get()
            })
        return tests

    # -------------------------------------------------------------------------
    # RESPONSE VIEWER (WITH TEST RESULTS TAB & DOCS AUTO-IMPORT)
    # -------------------------------------------------------------------------
    def _build_response_viewer(self, parent: ctk.CTkFrame):
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(3, weight=1)

        # Header Bar
        h = ctk.CTkFrame(parent, fg_color="transparent", height=36)
        h.grid(row=0, column=0, sticky="ew", padx=14, pady=(8, 2))

        self.resp_status_badge = ctk.CTkLabel(
            h,
            text="● READY",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#64748B",
            fg_color="#F1F5F9",
            corner_radius=10,
            padx=10,
            pady=3
        )
        self.resp_status_badge.pack(side="left")

        self.resp_time_badge = ctk.CTkLabel(
            h,
            text="⚡ -- ms",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#64748B",
            padx=8
        )
        self.resp_time_badge.pack(side="left")

        self.resp_size_badge = ctk.CTkLabel(
            h,
            text="📦 -- B",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#64748B",
            padx=8
        )
        self.resp_size_badge.pack(side="left")

        self.resp_tests_badge = ctk.CTkLabel(
            h,
            text="",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            padx=8
        )
        self.resp_tests_badge.pack(side="left")

        # Toggle Response Panel Button (Click to collapse to 10% bottom dock or expand)
        self.btn_toggle_resp = ctk.CTkButton(
            h,
            text="▲ Response",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=6,
            height=26,
            width=92,
            command=self._toggle_response_visibility
        )
        self.btn_toggle_resp.pack(side="left", padx=4)
        add_tooltip(self.btn_toggle_resp, "Expand / Collapse Response Panel")

        # Response Tabs: Body, Headers, Cookies, Test Results (INLINE in the straight line of tests passed)
        self.resp_nav_container = ctk.CTkFrame(h, fg_color="#F1F5F9", corner_radius=6, height=28)
        self.resp_nav_container.pack(side="left", padx=6)

        self.resp_tab_buttons = {}
        for tab_name in ["Body", "Headers", "Cookies", "Test Results"]:
            btn_t = ctk.CTkButton(
                self.resp_nav_container,
                text=tab_name,
                font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
                fg_color="#2563EB" if tab_name == "Body" else "transparent",
                hover_color="#1D4ED8" if tab_name == "Body" else "#E2E8F0",
                text_color="#FFFFFF" if tab_name == "Body" else "#475569",
                height=24,
                corner_radius=4,
                width=55 if tab_name != "Test Results" else 85,
                command=lambda tn=tab_name: self._switch_resp_tab(tn)
            )
            btn_t.pack(side="left", padx=2, pady=2)
            self.resp_tab_buttons[tab_name] = btn_t

        # Right Action Buttons
        # Right Action Buttons on Response Header line (clean, compact & never squished)
        self.btn_open_browser = ctk.CTkButton(
            h,
            text="🌐 Browser",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            corner_radius=6,
            height=26,
            width=78,
            command=self._open_current_url_in_browser
        )
        self.btn_open_browser.pack(side="right", padx=(0, 2))
        add_tooltip(self.btn_open_browser, "Open active request URL in browser")

        self.btn_max_resp = ctk.CTkButton(
            h,
            text="⤢ Expand",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=6,
            height=26,
            width=70,
            command=lambda: self._set_panes_layout("maximize_response")
        )
        self.btn_max_resp.pack(side="right", padx=(0, 2))
        add_tooltip(self.btn_max_resp, "Maximize Response view")

        self.btn_split_50 = ctk.CTkButton(
            h,
            text="↕ 50/50",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#475569",
            corner_radius=6,
            height=26,
            width=52,
            command=lambda: self._set_panes_layout("split_50_50")
        )
        self.btn_split_50.pack(side="right", padx=(0, 2))
        add_tooltip(self.btn_split_50, "Split view 50/50")

        self.btn_resp_search = ctk.CTkButton(
            h,
            text="🔍 Find",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=6,
            height=26,
            width=68,
            command=self._toggle_resp_search
        )
        self.btn_resp_search.pack(side="right", padx=(0, 4))
        add_tooltip(self.btn_resp_search, "Search in Response Body (Ctrl+F)")

        # Inline Toast Banner
        self.status_banner = ctk.CTkLabel(
            parent,
            text="",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#15803D",
            fg_color="#DCFCE7",
            corner_radius=6,
            height=24
        )

        # Docs / Swagger UI Intelligent Action Banner (Compact 24px strip with ✕ dismiss)
        self.docs_banner = ctk.CTkFrame(parent, fg_color="#EFF6FF", corner_radius=6, border_color="#BFDBFE", border_width=1, height=26)

        lbl_docs_msg = ctk.CTkLabel(
            self.docs_banner,
            text="💡 FastAPI / Swagger UI detected",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            text_color="#1E40AF"
        )
        lbl_docs_msg.pack(side="left", padx=8, pady=2)

        btn_dismiss_docs = ctk.CTkButton(
            self.docs_banner,
            text="✕",
            width=18,
            height=18,
            corner_radius=4,
            fg_color="transparent",
            hover_color="#DBEAFE",
            text_color="#64748B",
            font=ctk.CTkFont(size=9, weight="bold"),
            command=lambda: self.docs_banner.grid_forget()
        )
        btn_dismiss_docs.pack(side="right", padx=(2, 6), pady=2)

        btn_open_docs = ctk.CTkButton(
            self.docs_banner,
            text="🌐 View in Browser",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#2563EB",
            hover_color="#1D4ED8",
            corner_radius=4,
            height=20,
            width=100,
            command=self._open_current_url_in_browser
        )
        btn_open_docs.pack(side="right", padx=4, pady=2)

        btn_import_endpoints = ctk.CTkButton(
            self.docs_banner,
            text="⚡ Import All",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#10B981",
            hover_color="#059669",
            corner_radius=4,
            height=20,
            width=80,
            command=self._auto_import_from_active_docs
        )
        btn_import_endpoints.pack(side="right", padx=2, pady=2)

        # Response Content Container (Directly below header line, zero wasted space)
        self.resp_content_container = ctk.CTkFrame(parent, fg_color="transparent")
        self.resp_content_container.grid(row=3, column=0, sticky="nsew", padx=14, pady=(2, 8))
        self.resp_content_container.grid_columnconfigure(0, weight=1)
        self.resp_content_container.grid_rowconfigure(0, weight=1)

        # 1. Body View - Generous 420px height with dedicated toolbar
        self.resp_body_view = ctk.CTkFrame(self.resp_content_container, fg_color="transparent")
        self.resp_body_view.grid_columnconfigure(0, weight=1)
        self.resp_body_view.grid_rowconfigure(2, weight=1)

        # Body Mini-Toolbar right above text
        resp_body_bar = ctk.CTkFrame(self.resp_body_view, fg_color="transparent", height=28)
        resp_body_bar.grid(row=0, column=0, sticky="ew", padx=2, pady=(0, 4))

        self.lbl_resp_body_type = ctk.CTkLabel(
            resp_body_bar,
            text="Response Body",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            text_color="#64748B"
        )
        self.lbl_resp_body_type.pack(side="left", padx=(2, 8))

        # Distinct, clearly visible search button right at top of response body
        self.btn_body_view_search = ctk.CTkButton(
            resp_body_bar,
            text="🔍 Find in Body",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=6,
            height=24,
            width=115,
            command=self._toggle_resp_search
        )
        self.btn_body_view_search.pack(side="right", padx=(4, 0))
        add_tooltip(self.btn_body_view_search, "Search inside response body text")

        self.btn_wrap_toggle = ctk.CTkButton(
            resp_body_bar,
            text="↩ Wrap: OFF",
            font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#64748B",
            corner_radius=6,
            height=24,
            width=85,
            command=self._toggle_body_wrap
        )
        self.btn_wrap_toggle.pack(side="right", padx=(4, 0))
        add_tooltip(self.btn_wrap_toggle, "Toggle line wrapping")

        self.btn_copy_resp = ctk.CTkButton(
            resp_body_bar,
            text="📋 Copy",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            corner_radius=6,
            height=24,
            width=65,
            command=self._copy_response_body
        )
        self.btn_copy_resp.pack(side="right", padx=(4, 0))
        add_tooltip(self.btn_copy_resp, "Copy Response Body to Clipboard")

        # Response Textbox (Row 2, expandable)
        self.resp_body_textbox = ctk.CTkTextbox(
            self.resp_body_view,
            font=ctk.CTkFont(family="Consolas", size=12),
            fg_color="#F8FAFC",
            text_color="#0F172A",
            border_color="#CBD5E1",
            border_width=1,
            corner_radius=6,
            wrap="none",
            height=420
        )
        self.resp_body_textbox.grid(row=2, column=0, sticky="nsew")

        # Setup JSON syntax highlighting tags
        JSONSyntaxHighlighter.setup_tags(self.resp_body_textbox)

        # Integrated Search Bar for Response Body (Row 1, toggled above textbox)
        self.resp_search_bar = TextSearchBar(self.resp_body_view, self.resp_body_textbox, on_close=self._on_resp_search_closed)

        # 2. Headers View
        self.resp_headers_scroll = ctk.CTkScrollableFrame(self.resp_content_container, fg_color="#F8FAFC", corner_radius=6, height=420)
        self.resp_headers_scroll.grid_columnconfigure(0, weight=1)

        # 3. Cookies View
        self.resp_cookies_scroll = ctk.CTkScrollableFrame(self.resp_content_container, fg_color="#F8FAFC", corner_radius=6, height=420)
        self.resp_cookies_scroll.grid_columnconfigure(0, weight=1)

        # 4. Test Results View
        self.resp_test_res_scroll = ctk.CTkScrollableFrame(self.resp_content_container, fg_color="#F8FAFC", corner_radius=6, height=420)
        self.resp_test_res_scroll.grid_columnconfigure(0, weight=1)

        # Bind smart mousewheel cascading on all response components so main workspace scrolls smoothly
        self._bind_smart_mousewheel(self.resp_body_textbox)
        self._bind_smart_mousewheel(self.resp_body_view)
        self._bind_smart_mousewheel(self.resp_content_container)
        self._bind_smart_mousewheel(self.resp_headers_scroll)
        self._bind_smart_mousewheel(self.resp_cookies_scroll)
        self._bind_smart_mousewheel(self.resp_test_res_scroll)

        # Set default active tab to Body
        self._switch_resp_tab("Body")

    def _toggle_resp_search(self):
        if self.resp_search_bar and getattr(self.resp_search_bar, "is_open", False):
            self.resp_search_bar.close()
        elif self.resp_search_bar:
            self._switch_resp_tab("Body")
            self.resp_search_bar.open_search(row=1, sticky="e")
            if hasattr(self, "btn_resp_search"):
                self.btn_resp_search.configure(fg_color="#DBEAFE", text_color="#1D4ED8")
            if hasattr(self, "btn_body_view_search"):
                self.btn_body_view_search.configure(fg_color="#DBEAFE", text_color="#1D4ED8")

    def _on_resp_search_closed(self):
        if hasattr(self, "btn_resp_search"):
            self.btn_resp_search.configure(fg_color="#EFF6FF", text_color="#2563EB")
        if hasattr(self, "btn_body_view_search"):
            self.btn_body_view_search.configure(fg_color="#EFF6FF", text_color="#2563EB")

    def _toggle_response_visibility(self):
        """Manually toggles the response panel between bottom 10% dock and expanded view."""
        new_state = not getattr(self, "has_active_response", False)
        self._set_response_state(new_state)

    def _set_response_state(self, has_response: bool):
        """
        Manages response visibility and height dynamically.
        Before response generated: docks response card at bottom ~10% height, request editor occupies 90%+.
        After response generated: expands response card with generous 420px height for complete visibility.
        """
        self.has_active_response = has_response
        if has_response:
            self.resp_card.configure(height=480)
            if hasattr(self, "sash_v"):
                self.sash_v.pack(fill="x", expand=False, pady=1, before=self.resp_card)
            if hasattr(self, "resp_content_container"):
                self.resp_content_container.grid(row=3, column=0, sticky="nsew", padx=14, pady=(2, 8))
            if hasattr(self, "resp_body_textbox"):
                self.resp_body_textbox.configure(height=420)
            if hasattr(self, "resp_headers_scroll"):
                self.resp_headers_scroll.configure(height=420)
            if hasattr(self, "resp_cookies_scroll"):
                self.resp_cookies_scroll.configure(height=420)
            if hasattr(self, "resp_test_res_scroll"):
                self.resp_test_res_scroll.configure(height=420)
            if hasattr(self, "btn_toggle_resp"):
                self.btn_toggle_resp.configure(text="▼ Response", fg_color="#F1F5F9", text_color="#334155")
            if hasattr(self, "resp_nav_container"):
                self.resp_nav_container.pack(side="left", padx=6)
            if hasattr(self, "btn_copy_resp"):
                self.btn_copy_resp.pack(side="right")
            if hasattr(self, "btn_open_browser"):
                self.btn_open_browser.pack(side="right", padx=(0, 4))
            if hasattr(self, "btn_max_resp"):
                self.btn_max_resp.pack(side="right", padx=(0, 4))
            if hasattr(self, "btn_split_50"):
                self.btn_split_50.pack(side="right", padx=(0, 4))
            if hasattr(self, "btn_resp_search"):
                self.btn_resp_search.pack(side="right", padx=(0, 4))
            if hasattr(self, "btn_wrap_toggle"):
                self.btn_wrap_toggle.pack(side="right", padx=(0, 4))
        else:
            if hasattr(self, "resp_content_container"):
                self.resp_content_container.grid_forget()
            if hasattr(self, "docs_banner"):
                self.docs_banner.grid_forget()
            if hasattr(self, "sash_v"):
                self.sash_v.pack_forget()
            self.resp_card.configure(height=42)
            if hasattr(self, "btn_toggle_resp"):
                self.btn_toggle_resp.configure(text="▲ Response", fg_color="#EFF6FF", text_color="#2563EB")
            if hasattr(self, "resp_nav_container"):
                self.resp_nav_container.pack_forget()
            if hasattr(self, "btn_copy_resp"):
                self.btn_copy_resp.pack_forget()
            if hasattr(self, "btn_open_browser"):
                self.btn_open_browser.pack_forget()
            if hasattr(self, "btn_max_resp"):
                self.btn_max_resp.pack_forget()
            if hasattr(self, "btn_split_50"):
                self.btn_split_50.pack_forget()
            if hasattr(self, "btn_resp_search"):
                self.btn_resp_search.pack_forget()
            if hasattr(self, "btn_wrap_toggle"):
                self.btn_wrap_toggle.pack_forget()
            if self.resp_search_bar:
                self.resp_search_bar.close()

    def _switch_resp_tab(self, tab_name: str):
        self.active_resp_tab = tab_name
        for name, btn in self.resp_tab_buttons.items():
            if name == tab_name:
                btn.configure(fg_color="#2563EB", hover_color="#1D4ED8", text_color="#FFFFFF")
            else:
                btn.configure(fg_color="transparent", hover_color="#E2E8F0", text_color="#475569")

        # Hide all views
        self.resp_body_view.grid_forget()
        self.resp_headers_scroll.grid_forget()
        self.resp_cookies_scroll.grid_forget()
        self.resp_test_res_scroll.grid_forget()

        if tab_name == "Body":
            self.resp_body_view.grid(row=0, column=0, sticky="nsew")
        elif tab_name == "Headers":
            self.resp_headers_scroll.grid(row=0, column=0, sticky="nsew")
        elif tab_name == "Cookies":
            self.resp_cookies_scroll.grid(row=0, column=0, sticky="nsew")
        elif tab_name == "Test Results":
            self.resp_test_res_scroll.grid(row=0, column=0, sticky="nsew")

    def _toggle_body_wrap(self):
        current_wrap = self.resp_body_textbox.cget("wrap")
        if current_wrap == "none":
            self.resp_body_textbox.configure(wrap="char")
            if hasattr(self, "btn_wrap_toggle"):
                self.btn_wrap_toggle.configure(text="↩ Wrap: ON", fg_color="#DCFCE7", text_color="#15803D")
        else:
            self.resp_body_textbox.configure(wrap="none")
            if hasattr(self, "btn_wrap_toggle"):
                self.btn_wrap_toggle.configure(text="↩ Wrap: OFF", fg_color="#F1F5F9", text_color="#64748B")

    def _show_status_banner(self, text: str, is_error: bool = False):
        self.status_banner.configure(
            text=f"  {text}  ",
            text_color="#B91C1C" if is_error else "#15803D",
            fg_color="#FEE2E2" if is_error else "#DCFCE7"
        )
        self.status_banner.grid(row=1, column=0, sticky="ew", padx=14, pady=(0, 4))
        self.after(5000, lambda: self.status_banner.grid_forget())

    # -------------------------------------------------------------------------
    # SEND & EXECUTE LOGIC
    # -------------------------------------------------------------------------
    def _build_active_request_config(self) -> Tuple[RequestConfig, str]:
        raw_url = self.url_entry.get().strip()
        # Clean accidental wrappers like (url), <url>, "url", 'url'
        for _ in range(3):
            if (raw_url.startswith("(") and raw_url.endswith(")")) or \
               (raw_url.startswith("<") and raw_url.endswith(">")) or \
               (raw_url.startswith('"') and raw_url.endswith('"')) or \
               (raw_url.startswith("'") and raw_url.endswith("'")):
                raw_url = raw_url[1:-1].strip()

        base_url = self.base_url_entry.get().strip() if hasattr(self, "base_url_entry") else "http://localhost:8000"
        if not base_url:
            base_url = "http://localhost:8000"

        # Resolve relative paths or bare domains comfortably
        if raw_url.startswith("/"):
            resolved_url = f"{base_url.rstrip('/')}{raw_url}"
        elif raw_url.startswith("http://") or raw_url.startswith("https://") or raw_url.startswith("{{"):
            resolved_url = raw_url
        else:
            host_candidate = raw_url.split("/")[0].split("?")[0]
            if "." in host_candidate and not host_candidate.startswith("localhost"):
                resolved_url = f"https://{raw_url}"
            elif host_candidate.startswith("localhost") or host_candidate.startswith("127.0.0.1"):
                resolved_url = f"http://{raw_url}"
            else:
                resolved_url = f"{base_url.rstrip('/')}/{raw_url}"

        method = self.method_var.get().upper()

        params_list = [(k.get().strip(), v.get().strip(), en.get()) for _, en, k, v, _ in self.params_rows if k.get().strip()]
        headers_list = [(k.get().strip(), v.get().strip(), en.get()) for _, en, k, v, _ in self.headers_rows if k.get().strip()]

        # Authorization
        auth_type_ui = self.auth_type_var.get()
        auth_data = {}
        auth_type = "none"
        if auth_type_ui in ["Bearer Token", "bearer"] and hasattr(self, "auth_token_entry"):
            auth_type = "bearer"
            auth_data["token"] = self.auth_token_entry.get().strip()
        elif auth_type_ui in ["Basic Auth", "basic"] and hasattr(self, "auth_user_entry"):
            auth_type = "basic"
            auth_data["username"] = self.auth_user_entry.get().strip()
            auth_data["password"] = self.auth_pass_entry.get().strip()
        elif auth_type_ui in ["API Key", "apikey"] and hasattr(self, "auth_apikey_k"):
            auth_type = "apikey"
            auth_data["key"] = self.auth_apikey_k.get().strip()
            auth_data["value"] = self.auth_apikey_v.get().strip()
            auth_data["add_to"] = getattr(self, "auth_apikey_target", ctk.StringVar(value="Header")).get().lower()
        elif auth_type_ui in ["OAuth 2.0", "oauth2"] and hasattr(self, "auth_token_entry"):
            auth_type = "oauth2"
            auth_data["token"] = self.auth_token_entry.get().strip()
            auth_data["prefix"] = self.auth_oauth_prefix.get().strip() if hasattr(self, "auth_oauth_prefix") else "Bearer"
        elif auth_type_ui in ["Digest Auth", "digest"] and hasattr(self, "auth_user_entry"):
            auth_type = "digest"
            auth_data["username"] = self.auth_user_entry.get().strip()
            auth_data["password"] = self.auth_pass_entry.get().strip()
        elif auth_type_ui in ["AWS Signature", "aws"] and hasattr(self, "auth_aws_key"):
            auth_type = "aws"
            auth_data["access_key"] = self.auth_aws_key.get().strip()
            auth_data["secret_key"] = self.auth_aws_secret.get().strip()
            auth_data["region"] = self.auth_aws_region.get().strip()
            auth_data["service"] = self.auth_aws_service.get().strip()

        # Body
        body_type = self.body_type_var.get()
        body_raw_format = self.raw_format_var.get() if hasattr(self, "raw_format_var") else "JSON"
        body_content = self.body_textbox.get("1.0", "end-1c") if hasattr(self, "body_textbox") else ""

        # Form Data
        form_data = []
        if hasattr(self, "form_data_rows"):
            for _, en, k_entry, type_var, val_holder, d_entry in self.form_data_rows:
                k = k_entry.get().strip()
                t = type_var.get().lower()
                v = val_holder["entry"].get().strip() if (type_var.get() == "Text" and val_holder.get("entry")) else val_holder.get("val", "")
                d = d_entry.get().strip()
                if k or v:
                    form_data.append({"key": k, "value": v, "type": t, "description": d, "enabled": en.get()})

        # Urlencoded
        urlencoded_data = []
        if hasattr(self, "urlencoded_rows"):
            for _, en, k, v, d in self.urlencoded_rows:
                if k.get().strip() or v.get().strip():
                    urlencoded_data.append((k.get().strip(), v.get().strip(), en.get()))

        # Binary
        binary_path = getattr(self, "binary_file_path", "")

        # GraphQL
        graphql_query = self.graphql_query_box.get("1.0", "end-1c").strip() if hasattr(self, "graphql_query_box") else ""
        graphql_vars = self.graphql_vars_box.get("1.0", "end-1c").strip() if hasattr(self, "graphql_vars_box") else ""

        tests = self._gather_tests()

        config = RequestConfig(
            method=method,
            url=resolved_url,
            params=params_list,
            headers=headers_list,
            body_type=body_type,
            body_content=body_content,
            body_raw_format=body_raw_format,
            form_data=form_data,
            urlencoded_data=urlencoded_data,
            binary_path=binary_path,
            graphql_query=graphql_query,
            graphql_variables=graphql_vars,
            auth_type=auth_type,
            auth_data=auth_data,
            tests=tests,
            verify_ssl=False
        )
        return config, base_url

    def _send_request(self):
        config, base_url = self._build_active_request_config()
        if not config.url:
            self._show_status_banner("Please enter a target request URL.", is_error=True)
            return

        self.btn_send.configure(text="⏳ Sending...", state="disabled", fg_color="#94A3B8")
        self.resp_status_badge.configure(text="● CONNECTING...", text_color="#2563EB", fg_color="#EFF6FF")
        self._set_response_state(True)

        def _on_complete(res: ResponseData):
            self.after(0, lambda: self._handle_response_received(res))

        RequestEngine.execute_async(config, {"baseUrl": base_url}, _on_complete)

    def _handle_response_received(self, res: ResponseData):
        self.current_response = res
        self.btn_send.configure(text="▶ Send", state="normal", fg_color="#2563EB")
        self._set_response_state(True)
        # Note: Auto-scroll removed per user request - user scrolls manually

        if res.error:
            self.docs_banner.grid_forget()
            self.resp_status_badge.configure(text="● FAILED", text_color="#DC2626", fg_color="#FEE2E2")
            self.resp_time_badge.configure(text=f"⚡ {res.formatted_time}")
            self.resp_size_badge.configure(text="📦 0 B")
            self.resp_tests_badge.configure(text="")

            self.resp_body_textbox.delete("1.0", "end")
            self.resp_body_textbox.insert("1.0", f"Error:\n{res.error}")
            return

        code = res.status_code
        if 200 <= code < 300:
            badge_fg, badge_text = "#DCFCE7", "#15803D"
        elif 300 <= code < 400:
            badge_fg, badge_text = "#DBEAFE", "#2563EB"
        elif 400 <= code < 500:
            badge_fg, badge_text = "#FEF3C7", "#B45309"
        else:
            badge_fg, badge_text = "#FEE2E2", "#B91C1C"

        self.resp_status_badge.configure(
            text=f"● {code} {res.status_text}",
            text_color=badge_text,
            fg_color=badge_fg
        )
        self.resp_time_badge.configure(text=f"⚡ {res.formatted_time}")
        self.resp_size_badge.configure(text=f"📦 {res.formatted_size}")

        # Render Test Results Badge
        if res.test_results:
            passed_cnt = sum(1 for t in res.test_results if t.get("passed"))
            total_cnt = len(res.test_results)
            all_passed = (passed_cnt == total_cnt)
            self.resp_tests_badge.configure(
                text=f"Tests: {passed_cnt}/{total_cnt} Passed",
                text_color="#15803D" if all_passed else "#B91C1C",
                fg_color="#DCFCE7" if all_passed else "#FEE2E2",
                corner_radius=10
            )
        else:
            self.resp_tests_badge.configure(text="", fg_color="transparent")

        # Auto-save any Extracted Variables into the active collection (variable chaining)
        if res.extracted_variables:
            col = self.collection_manager.get_collection(self.active_collection_id) if self.active_collection_id else None
            if col:
                col_vars = col.setdefault("variables", {})
                extracted_msgs = []
                for k, v in res.extracted_variables.items():
                    col_vars[k] = v
                    extracted_msgs.append(f"{{{{{k}}}}} = {v[:25]}")
                self.collection_manager.save()
                self._show_status_banner(f"✓ Saved extracted variable(s): {', '.join(extracted_msgs)}", is_error=False)

        # Render Response Body with High-Performance Protection (Prevents loading lags on huge payloads)
        self.resp_body_textbox.delete("1.0", "end")
        body_text = res.body

        is_swagger_html = ("swagger-ui" in body_text.lower() or "fastapi" in body_text.lower()) and "<!doctype html" in body_text.lower()
        if is_swagger_html:
            self.docs_banner.grid(row=2, column=0, sticky="ew", padx=14, pady=(0, 4))
        else:
            self.docs_banner.grid_forget()

        try:
            parsed = json.loads(body_text)
            body_text = json.dumps(parsed, indent=2)
        except Exception:
            pass

        display_body = body_text
        if len(body_text) > 300_000:
            display_body = body_text[:150_000] + f"\n\n... [Truncated for high performance: payload is {len(body_text):,} bytes. Click '📋 Copy Body' to copy entire payload] ..."

        self.resp_body_textbox.insert("1.0", display_body)
        JSONSyntaxHighlighter.highlight(self.resp_body_textbox)
        if self.resp_search_bar and self.resp_search_bar.winfo_ismapped():
            self.resp_search_bar._on_query_changed()

        # Render Headers
        for w in self.resp_headers_scroll.winfo_children():
            w.destroy()
        for k, v in res.headers.items():
            r = ctk.CTkFrame(self.resp_headers_scroll, fg_color="transparent")
            r.pack(fill="x", pady=1, padx=4)
            ctk.CTkLabel(r, text=k, width=170, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#1E293B").pack(side="left")
            ctk.CTkLabel(r, text=v, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11), text_color="#475569").pack(side="left", fill="x", expand=True)

        # Render Cookies
        for w in self.resp_cookies_scroll.winfo_children():
            w.destroy()
        if not res.cookies:
            ctk.CTkLabel(self.resp_cookies_scroll, text="No cookies returned.", text_color="#94A3B8").pack(pady=8)
        else:
            for ck, cv in res.cookies.items():
                r = ctk.CTkFrame(self.resp_cookies_scroll, fg_color="transparent")
                r.pack(fill="x", pady=1, padx=4)
                ctk.CTkLabel(r, text=ck, width=140, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold")).pack(side="left")
                ctk.CTkLabel(r, text=cv, anchor="w", font=ctk.CTkFont(family=APP_FONT, size=11)).pack(side="left", fill="x", expand=True)

        # Render Test Results Tab
        for w in self.resp_test_res_scroll.winfo_children():
            w.destroy()
        if not res.test_results:
            ctk.CTkLabel(self.resp_test_res_scroll, text="No automated tests were enabled for this request.\nAdd assertions under the 'Tests' tab.", text_color="#94A3B8").pack(pady=12)
        else:
            for tr in res.test_results:
                passed = tr.get("passed", False)
                row_t = ctk.CTkFrame(self.resp_test_res_scroll, fg_color="#F8FAFC", corner_radius=6, border_color="#E2E8F0", border_width=1)
                row_t.pack(fill="x", pady=2, padx=4)

                badge = ctk.CTkLabel(
                    row_t,
                    text=" PASS " if passed else " FAIL ",
                    font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                    text_color="#15803D" if passed else "#B91C1C",
                    fg_color="#DCFCE7" if passed else "#FEE2E2",
                    corner_radius=4,
                    width=48,
                    height=20
                )
                badge.pack(side="left", padx=6, pady=4)

                ctk.CTkLabel(
                    row_t,
                    text=f"{tr.get('name')}  ({tr.get('detail')})",
                    font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold" if passed else "normal"),
                    text_color="#0F172A",
                    anchor="w"
                ).pack(side="left", fill="x", expand=True, padx=4)

    def _auto_import_from_active_docs(self):
        raw_url = self.url_entry.get().strip()
        base_url = self.base_url_entry.get().strip() or "http://localhost:8000"
        target = raw_url if raw_url.startswith("http") else base_url

        parsed = urlparse(target)
        host_root = f"{parsed.scheme}://{parsed.netloc}"
        openapi_url = f"{host_root}/openapi.json"

        self._show_status_banner(f"Fetching endpoints from {openapi_url}...", is_error=False)

        def _task():
            ok, data, msg = ShareService.fetch_collection_from_url(openapi_url)
            if ok and data:
                try:
                    imported = self.collection_manager.import_openapi_format(data, default_base_url=host_root)
                    self.after(0, lambda: [
                        self._render_collection_tree(),
                        self._load_request_into_ui(imported["id"], imported["items"][0]["id"] if imported.get("items") else None),
                        self._show_status_banner(f"✓ Successfully imported {len(imported.get('items', []))} FastAPI endpoints!", is_error=False)
                    ])
                except Exception as e:
                    self.after(0, lambda: self._show_status_banner(f"Failed to parse OpenAPI: {str(e)}", is_error=True))
            else:
                self.after(0, lambda: self._show_status_banner(f"Could not load {openapi_url}: {msg}", is_error=True))

        threading.Thread(target=_task, daemon=True).start()

    def _copy_response_body(self):
        text = self.resp_body_textbox.get("1.0", "end-1c")
        if text:
            self.clipboard_clear()
            self.clipboard_append(text)
            self._show_status_banner("✓ Response body copied to clipboard!", is_error=False)

    def _open_current_url_in_browser(self):
        url = self.url_entry.get().strip()
        base_url = self.base_url_entry.get().strip() or "http://localhost:8000"
        resolved = RequestEngine.interpolate_variables(url, {"baseUrl": base_url})
        if resolved.startswith("/"):
            resolved = f"{base_url.rstrip('/')}{resolved}"
        if resolved:
            webbrowser.open(resolved)

    # -------------------------------------------------------------------------
    # LOAD & SAVE REQUEST / COLLECTIONS
    # -------------------------------------------------------------------------
    def _on_method_change(self, method: str):
        colors = METHOD_COLORS.get(method.upper(), {"btn_bg": "#2563EB", "btn_hover": "#1D4ED8"})
        self.method_menu.configure(fg_color=colors["btn_bg"], button_color=colors["btn_hover"])

    def _set_default_request_ui(self):
        self.req_name_entry.delete(0, "end")
        self.req_name_entry.insert(0, "New Request")
        self.method_var.set("GET")
        self._on_method_change("GET")
        self.url_entry.delete(0, "end")
        self.url_entry.insert(0, "{{baseUrl}}/")
        
        # Reset Body
        self.body_type_var.set("none")
        if hasattr(self, "raw_format_var"):
            self.raw_format_var.set("JSON")
        self.body_textbox.delete("1.0", "end")
        self._on_body_type_changed()

        # Reset Form Data
        if hasattr(self, "form_data_rows"):
            for r in list(self.form_data_rows):
                r[0].destroy()
            self.form_data_rows.clear()
            self._add_form_data_row(enabled=False)

        # Reset Urlencoded
        if hasattr(self, "urlencoded_rows"):
            for r in list(self.urlencoded_rows):
                r[0].destroy()
            self.urlencoded_rows.clear()
            self._add_urlencoded_row(enabled=False)

        # Reset Binary
        self.binary_file_path = ""
        if hasattr(self, "lbl_binary_info"):
            self.lbl_binary_info.configure(text="No file selected", text_color="#64748B")

        # Reset GraphQL
        if hasattr(self, "graphql_query_box"):
            self.graphql_query_box.delete("1.0", "end")
        if hasattr(self, "graphql_vars_box"):
            self.graphql_vars_box.delete("1.0", "end")

        # Reset Auth
        self.auth_type_var.set("No Auth")
        self._render_auth_fields()

        # Clear and ensure 1 default empty row in Params & Headers (unchecked)
        for r in list(self.params_rows):
            r[0].destroy()
        self.params_rows.clear()
        self._add_kv_row("params", enabled=False)

        for r in list(self.headers_rows):
            r[0].destroy()
        self.headers_rows.clear()
        self._add_kv_row("headers", enabled=False)

        # Reset tests to standard 2 popular assertions
        self._clear_test_rows()
        self._add_test_row("status_code", "", "200", True)
        self._add_test_row("response_time", "", "500", True)

    def _load_request_into_ui(self, col_id: str, req_id: str):
        self._hide_in_page_view()
        self.active_collection_id = col_id
        self.active_request_id = req_id
        self.current_response = None
        self._set_response_state(has_response=False)

        col = self.collection_manager.get_collection(col_id)
        if not col:
            return

        base_url = col.get("variables", {}).get("baseUrl", "http://localhost:8000")
        self.base_url_entry.delete(0, "end")
        self.base_url_entry.insert(0, base_url)

        target_item = None
        for it in col.get("items", []):
            if it.get("id") == req_id:
                target_item = it
                break

        if not target_item:
            return

        req = target_item.get("request", {})

        # Name, Method, URL
        self.req_name_entry.delete(0, "end")
        self.req_name_entry.insert(0, target_item.get("name", "Request"))

        method = req.get("method", "GET").upper()
        self.method_var.set(method)
        self._on_method_change(method)

        self._suppress_url_sync = True
        self.url_entry.delete(0, "end")
        self.url_entry.insert(0, req.get("url", ""))
        self._suppress_url_sync = False

        # Load Params with at least one trailing empty row
        for row in list(self.params_rows):
            row[0].destroy()
        self.params_rows.clear()
        for p in req.get("params", []):
            if isinstance(p, dict):
                self._add_kv_row("params", p.get("key", ""), p.get("value", ""), p.get("description", ""), p.get("enabled", True))
            elif isinstance(p, (list, tuple)):
                self._add_kv_row("params", p[0], p[1], p[3] if len(p) > 3 else "", p[2] if len(p) > 2 else True)
        if not self.params_rows or (self.params_rows[-1][2].get().strip() or self.params_rows[-1][3].get().strip() or self.params_rows[-1][4].get().strip()):
            self._add_kv_row("params", enabled=False)

        # Load Headers with at least one trailing empty row
        for row in list(self.headers_rows):
            row[0].destroy()
        self.headers_rows.clear()
        for h in req.get("headers", []):
            if isinstance(h, dict):
                self._add_kv_row("headers", h.get("key", ""), h.get("value", ""), h.get("description", ""), h.get("enabled", True))
            elif isinstance(h, (list, tuple)):
                self._add_kv_row("headers", h[0], h[1], h[3] if len(h) > 3 else "", h[2] if len(h) > 2 else True)
        if not self.headers_rows or (self.headers_rows[-1][2].get().strip() or self.headers_rows[-1][3].get().strip() or self.headers_rows[-1][4].get().strip()):
            self._add_kv_row("headers", enabled=False)

        # Auth
        auth_type = req.get("auth_type", "none")
        auth_ui_map = {
            "none": "No Auth",
            "bearer": "Bearer Token",
            "apikey": "API Key",
            "basic": "Basic Auth",
            "oauth2": "OAuth 2.0",
            "digest": "Digest Auth",
            "aws": "AWS Signature"
        }
        self.auth_type_var.set(auth_ui_map.get(auth_type, auth_type))
        self._render_auth_fields()
        auth_data = req.get("auth_data", {})
        if auth_type in ["bearer", "oauth2"] and hasattr(self, "auth_token_entry"):
            self.auth_token_entry.insert(0, auth_data.get("token", ""))
            if auth_type == "oauth2" and hasattr(self, "auth_oauth_prefix"):
                self.auth_oauth_prefix.delete(0, "end")
                self.auth_oauth_prefix.insert(0, auth_data.get("prefix", "Bearer"))
        elif auth_type in ["basic", "digest"] and hasattr(self, "auth_user_entry"):
            self.auth_user_entry.insert(0, auth_data.get("username", ""))
            self.auth_pass_entry.insert(0, auth_data.get("password", ""))
        elif auth_type == "apikey" and hasattr(self, "auth_apikey_k"):
            self.auth_apikey_k.insert(0, auth_data.get("key", ""))
            self.auth_apikey_v.insert(0, auth_data.get("value", ""))
            if hasattr(self, "auth_apikey_target"):
                target_str = "Query Params" if auth_data.get("add_to") == "params" else "Header"
                self.auth_apikey_target.set(target_str)
        elif auth_type == "aws" and hasattr(self, "auth_aws_key"):
            self.auth_aws_key.insert(0, auth_data.get("access_key", ""))
            self.auth_aws_secret.insert(0, auth_data.get("secret_key", ""))
            self.auth_aws_region.insert(0, auth_data.get("region", "us-east-1"))
            self.auth_aws_service.insert(0, auth_data.get("service", ""))

        # Body
        body_type = req.get("body_type", "none")
        self.body_type_var.set(body_type)
        if hasattr(self, "raw_format_var"):
            self.raw_format_var.set(req.get("body_raw_format", "JSON"))
        self.body_textbox.delete("1.0", "end")
        self.body_textbox.insert("1.0", req.get("body_content", ""))
        JSONSyntaxHighlighter.highlight(self.body_textbox)

        # Form Data
        if hasattr(self, "form_data_rows"):
            for r in list(self.form_data_rows):
                r[0].destroy()
            self.form_data_rows.clear()
            for fd in req.get("form_data", []):
                self._add_form_data_row(
                    key=fd.get("key", ""),
                    val=fd.get("value", ""),
                    field_type="File" if fd.get("type", "").lower() == "file" else "Text",
                    description=fd.get("description", ""),
                    enabled=fd.get("enabled", True)
                )
            if not self.form_data_rows or (self.form_data_rows[-1][2].get().strip() or self.form_data_rows[-1][4].get("val", "") or (self.form_data_rows[-1][4].get("entry") and self.form_data_rows[-1][4]["entry"].get().strip())):
                self._add_form_data_row()

        # Urlencoded
        if hasattr(self, "urlencoded_rows"):
            for r in list(self.urlencoded_rows):
                r[0].destroy()
            self.urlencoded_rows.clear()
            for ue in req.get("urlencoded_data", []):
                if isinstance(ue, dict):
                    self._add_urlencoded_row(ue.get("key", ""), ue.get("value", ""), ue.get("description", ""), ue.get("enabled", True))
                elif isinstance(ue, (list, tuple)):
                    self._add_urlencoded_row(ue[0], ue[1], ue[3] if len(ue) > 3 else "", ue[2] if len(ue) > 2 else True)
            if not self.urlencoded_rows or (self.urlencoded_rows[-1][2].get().strip() or self.urlencoded_rows[-1][3].get().strip()):
                self._add_urlencoded_row()

        # Binary
        bpath = req.get("binary_path", "")
        self.binary_file_path = bpath
        if hasattr(self, "lbl_binary_info"):
            if bpath:
                fname = os.path.basename(bpath)
                self.lbl_binary_info.configure(text=f"📄 {fname} - {bpath}", text_color="#0F172A")
            else:
                self.lbl_binary_info.configure(text="No file selected", text_color="#64748B")

        # GraphQL
        if hasattr(self, "graphql_query_box"):
            self.graphql_query_box.delete("1.0", "end")
            self.graphql_query_box.insert("1.0", req.get("graphql_query", ""))
        if hasattr(self, "graphql_vars_box"):
            self.graphql_vars_box.delete("1.0", "end")
            self.graphql_vars_box.insert("1.0", req.get("graphql_variables", ""))

        self._on_body_type_changed()

        # Load automated test assertions
        self._clear_test_rows()
        saved_tests = req.get("tests", [])
        if saved_tests:
            for t in saved_tests:
                self._add_test_row(
                    test_type=t.get("type", "status_code"),
                    target=t.get("target", ""),
                    value=t.get("value", ""),
                    enabled=t.get("enabled", True)
                )
        else:
            self._add_test_row("status_code", "", "200", True)
            self._add_test_row("response_time", "", "500", True)

        self._render_collection_tree()

    def _save_current_request(self):
        if not self.active_collection_id:
            if not self.collection_manager.collections:
                self.collection_manager.create_collection("My API Tests")
            self.active_collection_id = self.collection_manager.collections[0]["id"]

        name = self.req_name_entry.get().strip() or "Untitled Request"
        cfg, _ = self._build_active_request_config()

        params_list = [{"key": k.get().strip(), "value": v.get().strip(), "description": d.get().strip(), "enabled": en.get()} for _, en, k, v, d in self.params_rows if k.get().strip()]
        headers_list = [{"key": k.get().strip(), "value": v.get().strip(), "description": d.get().strip(), "enabled": en.get()} for _, en, k, v, d in self.headers_rows if k.get().strip()]

        req_dict = {
            "method": cfg.method,
            "url": self.url_entry.get().strip(),
            "params": params_list,
            "headers": headers_list,
            "auth_type": cfg.auth_type,
            "auth_data": cfg.auth_data,
            "body_type": cfg.body_type,
            "body_content": cfg.body_content,
            "body_raw_format": cfg.body_raw_format,
            "form_data": cfg.form_data,
            "urlencoded_data": [{"key": k, "value": v, "enabled": en} for k, v, en in cfg.urlencoded_data],
            "binary_path": cfg.binary_path,
            "graphql_query": cfg.graphql_query,
            "graphql_variables": cfg.graphql_variables,
            "tests": self._gather_tests()
        }

        saved = self.collection_manager.save_request(
            col_id=self.active_collection_id,
            name=name,
            request_dict=req_dict,
            req_id=self.active_request_id
        )
        self.active_request_id = saved["id"]
        self._render_collection_tree()
        self._show_status_banner(f"✓ Saved '{name}' (Ctrl+S)", is_error=False)

        # Visual button feedback
        if hasattr(self, "btn_save_req"):
            orig_fg = self.btn_save_req.cget("fg_color")
            orig_tc = self.btn_save_req.cget("text_color")
            self.btn_save_req.configure(text="✓ Saved", fg_color="#DCFCE7", text_color="#15803D")
            self.after(900, lambda: self.btn_save_req.configure(text="💾 Save", fg_color=orig_fg, text_color=orig_tc))

    def _on_click_new_collection(self):
        """Prompts for a new collection name and adds it to the collection manager."""
        dialog = ctk.CTkInputDialog(text="Enter Collection Name:", title="New Collection")
        name = dialog.get_input()
        if name is not None:
            col_name = name.strip() or "New Collection"
            existing_names = [c.get("name", "") for c in self.collection_manager.collections]
            if col_name in existing_names:
                col_name = generate_copy_name(col_name, existing_names)
            new_col = self.collection_manager.create_collection(col_name)
            self.active_collection_id = new_col["id"]
            self.active_request_id = None
            self._render_collection_tree()
            self._set_default_request_ui()
            self._show_status_banner(f"✓ Created collection: {new_col['name']}", is_error=False)

    def _on_click_new_request(self):
        if not self.active_collection_id:
            if not self.collection_manager.collections:
                self.collection_manager.create_collection("My API Tests")
            self.active_collection_id = self.collection_manager.collections[0]["id"]

        self.active_request_id = None
        self._set_default_request_ui()
        self._save_current_request()

    def _open_collection_runner(self):
        """Collection Runner - executes all requests locally in-page with variable chaining and test reports."""
        if not self.active_collection_id:
            self._show_status_banner("Please select a collection first.", is_error=True)
            return

        col = self.collection_manager.get_collection(self.active_collection_id)
        if not col or not col.get("items"):
            self._show_status_banner("Active collection has no requests to run.", is_error=True)
            return

        self._show_in_page_view(lambda panel: self._build_in_page_runner(panel, col))

    def _build_in_page_runner(self, panel: ctk.CTkFrame, col: Dict[str, Any]):
        col_name = col.get("name", "Collection")
        items = col.get("items", [])
        base_url = col.get("variables", {}).get("baseUrl", "http://localhost:8000")

        # Top Bar with Back Button
        top_f = ctk.CTkFrame(panel, fg_color="transparent")
        top_f.pack(fill="x", padx=16, pady=(12, 6))

        btn_back = ctk.CTkButton(
            top_f,
            text="← Back to Request Editor",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=6,
            height=28,
            width=175,
            command=self._hide_in_page_view
        )
        btn_back.pack(side="left")

        ctk.CTkLabel(
            top_f,
            text=f"🚀 Collection Runner: {col_name}",
            font=ctk.CTkFont(family=APP_FONT, size=14, weight="bold"),
            text_color="#0F172A"
        ).pack(side="left", padx=12)

        # Base URL Bar inside runner
        base_f = ctk.CTkFrame(panel, fg_color="#F8FAFC", corner_radius=6, height=36)
        base_f.pack(fill="x", padx=16, pady=(0, 8))
        base_f.pack_propagate(False)

        ctk.CTkLabel(base_f, text="Base URL ({{baseUrl}}):", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#334155").pack(side="left", padx=10)
        base_url_run_entry = ctk.CTkEntry(base_f, height=26, font=ctk.CTkFont(family=APP_FONT, size=11))
        base_url_run_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))
        base_url_run_entry.insert(0, base_url)

        # Selection checkboxes
        items_scroll = ctk.CTkScrollableFrame(panel, fg_color="#F8FAFC", corner_radius=8, height=130)
        items_scroll.pack(fill="x", padx=16, pady=(0, 8))

        checkboxes = []
        for it in items:
            req_data = it.get("request", {})
            m = req_data.get("method", "GET").upper()
            var = ctk.BooleanVar(value=True)
            r = ctk.CTkFrame(items_scroll, fg_color="transparent")
            r.pack(fill="x", pady=2, padx=4)

            chk = ctk.CTkCheckBox(r, text="", variable=var, width=20, checkbox_width=16, checkbox_height=16)
            chk.pack(side="left", padx=(0, 6))

            m_colors = METHOD_COLORS.get(m, {"badge_text": "#475569", "badge_bg": "#F1F5F9"})
            m_badge = ctk.CTkLabel(
                r,
                text=m,
                width=45,
                font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                text_color=m_colors["badge_text"],
                fg_color=m_colors["badge_bg"],
                corner_radius=4,
                padx=2,
                pady=1
            )
            m_badge.pack(side="left", padx=(0, 6))

            ctk.CTkLabel(r, text=it.get("name", "Request"), font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#0F172A", width=180, anchor="w").pack(side="left")
            ctk.CTkLabel(r, text=req_data.get("url", ""), font=ctk.CTkFont(family=APP_FONT, size=10), text_color="#64748B", anchor="w").pack(side="left", fill="x", expand=True)

            checkboxes.append((var, it))

        # Runner Controls Bar
        ctl_bar = ctk.CTkFrame(panel, fg_color="transparent")
        ctl_bar.pack(fill="x", padx=16, pady=(0, 8))

        status_lbl = ctk.CTkLabel(ctl_bar, text="Ready to run all tests.", font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#64748B")
        status_lbl.pack(side="left")

        btn_start_run = ctk.CTkButton(
            ctl_bar,
            text="▶ Run Selected Tests",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#10B981",
            hover_color="#059669",
            height=30,
            width=150
        )
        btn_start_run.pack(side="right")

        btn_copy_report = ctk.CTkButton(
            ctl_bar,
            text="📋 Copy Report",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            height=30,
            width=100,
            state="disabled"
        )
        btn_copy_report.pack(side="right", padx=6)

        # Results area
        results_scroll = ctk.CTkScrollableFrame(panel, fg_color="#F8FAFC", corner_radius=8)
        results_scroll.pack(fill="both", expand=True, padx=16, pady=(0, 14))

        last_report = {}

        def _copy_report_action():
            if not last_report:
                return
            lines = [
                f"# API Test Run Report: {col_name}",
                f"- Total Requests: {last_report.get('total_requests')}",
                f"- Total Tests: {last_report.get('total_tests')}",
                f"- Passed: {last_report.get('passed_tests')}",
                f"- Failed: {last_report.get('failed_tests')}",
                f"- Duration: {last_report.get('total_time_ms'):.0f} ms",
                "",
                "## Test Results Breakdown:"
            ]
            for it in last_report.get("items", []):
                lines.append(f"### [{it.get('method')}] {it.get('name')} - Status: {it.get('status_code')} ({it.get('time_ms'):.0f} ms)")
                for tr in it.get("test_results", []):
                    mark = "✓ PASS" if tr.get("passed") else "✕ FAIL"
                    lines.append(f"  - {mark}: {tr.get('name')} ({tr.get('detail')})")
            report_text = "\n".join(lines)
            self.clipboard_clear()
            self.clipboard_append(report_text)
            status_lbl.configure(text="✓ Full Test Report copied to clipboard!", text_color="#15803D")

        btn_copy_report.configure(command=_copy_report_action)

        def _do_run():
            selected_items = [it for var, it in checkboxes if var.get()]
            if not selected_items:
                status_lbl.configure(text="Please select at least one request to run.", text_color="#EF4444")
                return

            btn_start_run.configure(state="disabled", text="⏳ Running...", fg_color="#94A3B8")
            status_lbl.configure(text="Executing tests locally at top speed...", text_color="#2563EB")
            for w in results_scroll.winfo_children():
                w.destroy()

            run_baseUrl = base_url_run_entry.get().strip() or "http://localhost:8000"

            batch_reqs = []
            for it in selected_items:
                req_data = it.get("request", {})
                method = req_data.get("method", "GET").upper()
                raw_url = req_data.get("url", "")
                if raw_url.startswith("/"):
                    resolved_url = f"{run_baseUrl.rstrip('/')}{raw_url}"
                elif not raw_url.startswith("http://") and not raw_url.startswith("https://") and not raw_url.startswith("{{"):
                    resolved_url = f"{run_baseUrl.rstrip('/')}/{raw_url}"
                else:
                    resolved_url = raw_url

                p_list = []
                for p in req_data.get("params", []):
                    if isinstance(p, dict) and p.get("enabled", True):
                        p_list.append((p.get("key", ""), p.get("value", ""), True))
                h_list = []
                for h in req_data.get("headers", []):
                    if isinstance(h, dict) and h.get("enabled", True):
                        h_list.append((h.get("key", ""), h.get("value", ""), True))

                cfg = RequestConfig(
                    method=method,
                    url=resolved_url,
                    params=p_list,
                    headers=h_list,
                    body_type=req_data.get("body_type", "none"),
                    body_content=req_data.get("body_content", ""),
                    auth_type=req_data.get("auth_type", "none"),
                    auth_data=req_data.get("auth_data", {}),
                    tests=req_data.get("tests", [{"type": "status_code", "value": 200, "enabled": True}]),
                    verify_ssl=False
                )
                batch_reqs.append((it.get("name", "Request"), cfg))

            def _worker():
                initial_vars = dict(col.get("variables", {}))
                initial_vars["baseUrl"] = run_baseUrl
                report = RequestEngine.execute_batch(batch_reqs, initial_variables=initial_vars)
                self.after(0, lambda: _render_batch_results(report))

            threading.Thread(target=_worker, daemon=True).start()

        btn_start_run.configure(command=_do_run)

        def _render_batch_results(report: Dict[str, Any]):
            nonlocal last_report
            last_report = report
            btn_start_run.configure(state="normal", text="▶ Run Selected Tests", fg_color="#10B981")
            btn_copy_report.configure(state="normal")

            all_passed = report.get("all_passed")
            pass_cnt = report.get("passed_tests", 0)
            fail_cnt = report.get("failed_tests", 0)
            tot_tests = report.get("total_tests", 0)
            tot_time = report.get("total_time_ms", 0.0)

            sum_card = ctk.CTkFrame(
                results_scroll,
                fg_color="#DCFCE7" if all_passed else "#FEE2E2",
                corner_radius=8,
                border_color="#86EFAC" if all_passed else "#FCA5A5",
                border_width=1
            )
            sum_card.pack(fill="x", pady=(2, 8), padx=2)

            sum_txt = f"✓ All {tot_tests} Tests Passed! (100% Pass Rate)" if all_passed else f"✕ {fail_cnt} / {tot_tests} Tests Failed"
            ctk.CTkLabel(
                sum_card,
                text=sum_txt,
                font=ctk.CTkFont(family=APP_FONT, size=13, weight="bold"),
                text_color="#15803D" if all_passed else "#B91C1C"
            ).pack(side="left", padx=12, pady=8)

            ctk.CTkLabel(
                sum_card,
                text=f"Duration: {tot_time:.0f} ms | Requests: {report.get('total_requests')}",
                font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
                text_color="#15803D" if all_passed else "#B91C1C"
            ).pack(side="right", padx=12, pady=8)

            status_lbl.configure(
                text=f"Finished: {pass_cnt} passed, {fail_cnt} failed in {tot_time:.0f}ms",
                text_color="#15803D" if all_passed else "#B91C1C"
            )

            for it in report.get("items", []):
                req_card = ctk.CTkFrame(results_scroll, fg_color="#FFFFFF", corner_radius=6, border_color="#E2E8F0", border_width=1)
                req_card.pack(fill="x", pady=3, padx=2)

                rh = ctk.CTkFrame(req_card, fg_color="transparent")
                rh.pack(fill="x", padx=8, pady=4)

                m = it.get("method", "GET")
                m_colors = METHOD_COLORS.get(m, {"badge_text": "#475569", "badge_bg": "#F1F5F9"})
                ctk.CTkLabel(
                    rh,
                    text=m,
                    width=42,
                    font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                    text_color=m_colors["badge_text"],
                    fg_color=m_colors["badge_bg"],
                    corner_radius=4
                ).pack(side="left", padx=(0, 6))

                ctk.CTkLabel(rh, text=it.get("name", ""), font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"), text_color="#0F172A", width=180, anchor="w").pack(side="left")

                sc = it.get("status_code", 0)
                badge_fg = "#DCFCE7" if 200 <= sc < 300 else "#FEE2E2"
                badge_txt = "#15803D" if 200 <= sc < 300 else "#B91C1C"
                ctk.CTkLabel(rh, text=f"{sc}", font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"), text_color=badge_txt, fg_color=badge_fg, corner_radius=4, padx=6).pack(side="left", padx=4)

                ctk.CTkLabel(rh, text=f"{it.get('time_ms', 0):.0f} ms", font=ctk.CTkFont(family=APP_FONT, size=10), text_color="#64748B").pack(side="left", padx=6)

                p_cnt = it.get("passed_tests", 0)
                f_cnt = it.get("failed_tests", 0)
                tot = p_cnt + f_cnt
                all_p = (f_cnt == 0 and tot > 0)
                ctk.CTkLabel(
                    rh,
                    text=f"{p_cnt}/{tot} Passed" if tot > 0 else "No assertions",
                    font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                    text_color="#15803D" if all_p else ("#B91C1C" if f_cnt > 0 else "#64748B"),
                    fg_color="#DCFCE7" if all_p else ("#FEE2E2" if f_cnt > 0 else "#F1F5F9"),
                    corner_radius=4,
                    padx=6
                ).pack(side="right")

                for tr in it.get("test_results", []):
                    passed = tr.get("passed")
                    tr_row = ctk.CTkFrame(req_card, fg_color="#F8FAFC", corner_radius=4)
                    tr_row.pack(fill="x", padx=10, pady=1)

                    ctk.CTkLabel(
                        tr_row,
                        text="✓" if passed else "✕",
                        font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold"),
                        text_color="#15803D" if passed else "#B91C1C",
                        width=18
                    ).pack(side="left")

                    ctk.CTkLabel(
                        tr_row,
                        text=f"{tr.get('name')}",
                        font=ctk.CTkFont(family=APP_FONT, size=10, weight="bold" if passed else "normal"),
                        text_color="#1E293B",
                        anchor="w"
                    ).pack(side="left", padx=(0, 4))

                    ctk.CTkLabel(
                        tr_row,
                        text=f"({tr.get('detail')})",
                        font=ctk.CTkFont(family=APP_FONT, size=9),
                        text_color="#64748B",
                        anchor="w"
                    ).pack(side="left", fill="x", expand=True)

                if it.get("error"):
                    err_lbl = ctk.CTkLabel(req_card, text=f"Error: {it.get('error')}", font=ctk.CTkFont(family=APP_FONT, size=10), text_color="#EF4444", anchor="w")
                    err_lbl.pack(fill="x", padx=10, pady=2)

    def _confirm_delete_collection(self, col_id: str):
        col = self.collection_manager.get_collection(col_id)
        if not col:
            return
        if messagebox.askyesno("Delete Collection", f"Are you sure you want to delete collection '{col.get('name')}'?"):
            self.collection_manager.delete_collection(col_id)
            if self.active_collection_id == col_id:
                self.active_collection_id = self.collection_manager.collections[0]["id"] if self.collection_manager.collections else None
                self.active_request_id = None
                self._set_default_request_ui()
            self._render_collection_tree()

    def _confirm_delete_request(self, col_id: str, req_id: str):
        if messagebox.askyesno("Delete Request", "Are you sure you want to delete this request?"):
            self.collection_manager.delete_request(col_id, req_id)
            if self.active_request_id == req_id:
                self.active_request_id = None
                self._set_default_request_ui()
            self._render_collection_tree()

    # -------------------------------------------------------------------------
    # ZERO-SERVER LINK SHARING & IMPORT (IN-PAGE - NO EXTERNAL POPUPS)
    # -------------------------------------------------------------------------
    def _quick_share_link(self):
        """In-Page Zero-Server Collection Sharing."""
        if not self.active_collection_id:
            self._show_status_banner("Select a collection to share.", is_error=True)
            return

        col = self.collection_manager.get_collection(self.active_collection_id)
        if not col:
            return

        self._show_in_page_view(lambda panel: self._build_in_page_share(panel, col))

    def _build_in_page_share(self, panel: ctk.CTkFrame, col: Dict[str, Any]):
        col_name = col.get("name", "Collection")
        collection_json = self.collection_manager.export_collection_format(self.active_collection_id)
        collection_json_str = json.dumps(collection_json, indent=2)

        top_f = ctk.CTkFrame(panel, fg_color="transparent")
        top_f.pack(fill="x", padx=16, pady=(12, 8))

        btn_back = ctk.CTkButton(
            top_f,
            text="← Back to Request Editor",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=6,
            height=28,
            width=175,
            command=self._hide_in_page_view
        )
        btn_back.pack(side="left")

        ctk.CTkLabel(
            top_f,
            text=f"📤 Share Collection: {col_name}",
            font=ctk.CTkFont(family=APP_FONT, size=14, weight="bold"),
            text_color="#0F172A"
        ).pack(side="left", padx=12)

        card = ctk.CTkFrame(panel, fg_color="#F8FAFC", corner_radius=10, border_color="#E2E8F0", border_width=1)
        card.pack(fill="both", expand=True, padx=16, pady=(0, 14))

        status_lbl = ctk.CTkLabel(
            card,
            text="⏳ Generating instant public share link...",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            text_color="#2563EB"
        )
        status_lbl.pack(anchor="w", padx=20, pady=(14, 6))

        # URL Input Bar
        url_e = ctk.CTkEntry(
            card,
            font=ctk.CTkFont(family=APP_FONT, size=12),
            height=36
        )
        url_e.pack(fill="x", padx=20, pady=(0, 8))

        # Buttons Row: Share Link Actions
        btn_row = ctk.CTkFrame(card, fg_color="transparent")
        btn_row.pack(fill="x", padx=20, pady=(0, 10))

        btn_copy = ctk.CTkButton(
            btn_row,
            text="📋 Copy Share Link",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#10B981",
            hover_color="#059669",
            height=34
        )
        btn_copy.pack(side="left", padx=(0, 8))

        btn_open = ctk.CTkButton(
            btn_row,
            text="🌐 Open in Browser",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            height=34
        )
        btn_open.pack(side="left", padx=(0, 8))

        def _do_copy():
            link = url_e.get().strip()
            if link:
                self.clipboard_clear()
                self.clipboard_append(link)
                status_lbl.configure(text="✓ Share link copied! Ready to share with teammates or import anywhere.", text_color="#15803D")

        btn_copy.configure(command=_do_copy)
        btn_open.configure(command=lambda: webbrowser.open(url_e.get().strip()) if url_e.get().strip() else None)

        # Direct Export Section
        sep = ctk.CTkFrame(card, height=1, fg_color="#E2E8F0")
        sep.pack(fill="x", padx=20, pady=(4, 12))

        ctk.CTkLabel(
            card,
            text="📮 Direct Collection Export (v2.1.0 Standard)",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            text_color="#0F172A"
        ).pack(anchor="w", padx=20, pady=(0, 8))

        export_row = ctk.CTkFrame(card, fg_color="transparent")
        export_row.pack(fill="x", padx=20, pady=(0, 12))

        def _do_save_file():
            safe_name = "".join(c for c in col_name if c.isalnum() or c in ("-", "_", " ")).strip().replace(" ", "_")
            if not safe_name:
                safe_name = "SharePort_Collection"
            dest = filedialog.asksaveasfilename(
                initialfile=f"{safe_name}.collection.json",
                defaultextension=".json",
                filetypes=[("Collection File v2.1", "*.collection.json;*.json"), ("JSON Files", "*.json"), ("All Files", "*.*")]
            )
            if dest:
                try:
                    with open(dest, "w", encoding="utf-8") as f:
                        f.write(collection_json_str)
                    status_lbl.configure(text=f"✓ Exported to {os.path.basename(dest)}!", text_color="#15803D")
                except Exception as ex:
                    status_lbl.configure(text=f"Export failed: {ex}", text_color="#EF4444")

        btn_download = ctk.CTkButton(
            export_row,
            text="📥 Save .json Collection File",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#0284C7",
            hover_color="#0369A1",
            height=34,
            command=_do_save_file
        )
        btn_download.pack(side="left", padx=(0, 8))

        def _do_copy_json():
            self.clipboard_clear()
            self.clipboard_append(collection_json_str)
            status_lbl.configure(text="✓ Raw v2.1 JSON copied! Click Import → Paste Raw Text.", text_color="#15803D")

        btn_copy_json = ctk.CTkButton(
            export_row,
            text="📋 Copy Raw v2.1 JSON",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            height=34,
            command=_do_copy_json
        )
        btn_copy_json.pack(side="left")

        # Two-Way Collection Compatibility Guide Card
        guide_box = ctk.CTkFrame(card, fg_color="#F1F5F9", corner_radius=8, border_color="#CBD5E1", border_width=1)
        guide_box.pack(fill="x", padx=20, pady=(4, 16))

        guide_text = (
            "💡 Two-Way Collection Compatibility Guide:\n"
            "• Standard Format: Click 'Import' in any client → Paste this Share Link, paste raw JSON, or select the saved .json file.\n"
            "• In Share Port: Click '📥 Import' at top of sidebar → Paste any URL/link or select any exported .json file.\n"
            "• Full feature parity: Method, headers, query params, form-data, JSON bodies, and Auth configs are fully preserved."
        )
        ctk.CTkLabel(
            guide_box,
            text=guide_text,
            font=ctk.CTkFont(family=APP_FONT, size=11),
            text_color="#475569",
            justify="left"
        ).pack(anchor="w", padx=12, pady=10)

        # Background generation of public link
        def _bg_task():
            ok, url_or_err = ShareService.share_online(collection_json, title=col_name)
            final_url = url_or_err if ok else ShareService.generate_compressed_link(collection_json)
            def _update_ui():
                url_e.delete(0, "end")
                url_e.insert(0, final_url)
                self.clipboard_clear()
                self.clipboard_append(final_url)
                msg = "✓ Public Share Link ready & copied to clipboard! (Compatible with standard collection format)"
                status_lbl.configure(text=msg, text_color="#15803D")
            self.after(0, _update_ui)

        threading.Thread(target=_bg_task, daemon=True).start()

    def _open_import_dialog(self):
        """In-Page Collection Importer - imports from link, collection JSON, Swagger UI, FastAPI docs, or local file."""
        self._show_in_page_view(self._build_in_page_import)

    def _build_in_page_import(self, panel: ctk.CTkFrame):
        top_f = ctk.CTkFrame(panel, fg_color="transparent")
        top_f.pack(fill="x", padx=16, pady=(12, 8))

        btn_back = ctk.CTkButton(
            top_f,
            text="← Back to Request Editor",
            font=ctk.CTkFont(family=APP_FONT, size=11, weight="bold"),
            fg_color="#EFF6FF",
            hover_color="#DBEAFE",
            text_color="#2563EB",
            corner_radius=6,
            height=28,
            width=175,
            command=self._hide_in_page_view
        )
        btn_back.pack(side="left")

        ctk.CTkLabel(
            top_f,
            text="📥 Import Collection (OpenAPI / Swagger / Link / File)",
            font=ctk.CTkFont(family=APP_FONT, size=14, weight="bold"),
            text_color="#0F172A"
        ).pack(side="left", padx=12)

        card = ctk.CTkFrame(panel, fg_color="#F8FAFC", corner_radius=10, border_color="#E2E8F0", border_width=1)
        card.pack(fill="both", expand=True, padx=16, pady=(0, 14))

        ctk.CTkLabel(
            card,
            text="Paste share link, bytebin URL, FastAPI /docs, or Swagger URL:",
            font=ctk.CTkFont(family=APP_FONT, size=12),
            text_color="#475569"
        ).pack(anchor="w", padx=20, pady=(14, 6))

        url_e = ctk.CTkEntry(
            card,
            placeholder_text="Enter link (e.g. https://bytebin.lucko.me/... or http://localhost:8000/docs or raw JSON link)",
            height=36,
            font=ctk.CTkFont(family=APP_FONT, size=12)
        )
        url_e.pack(fill="x", padx=20, pady=(0, 8))

        status_lbl = ctk.CTkLabel(card, text="", font=ctk.CTkFont(family=APP_FONT, size=11))
        status_lbl.pack(padx=20, pady=(0, 8))

        def _do_url():
            u = url_e.get().strip()
            if not u:
                status_lbl.configure(text="Please paste a valid collection or docs link.", text_color="#EF4444")
                return

            status_lbl.configure(text="Fetching & parsing collection...", text_color="#2563EB")

            def _task():
                ok, data, msg = ShareService.fetch_collection_from_url(u)
                if ok and data:
                    try:
                        imported = self.collection_manager.import_collection_format(data)
                        self.after(0, lambda: [
                            self._render_collection_tree(),
                            self._load_request_into_ui(imported["id"], imported["items"][0]["id"] if imported.get("items") else None),
                            self._show_status_banner(f"✓ Successfully imported '{imported.get('name')}' with {len(imported.get('items', []))} requests!", is_error=False),
                            self._hide_in_page_view()
                        ])
                    except Exception as err:
                        self.after(0, lambda: status_lbl.configure(text=f"Parse Error: {str(err)}", text_color="#EF4444"))
                else:
                    self.after(0, lambda: status_lbl.configure(text=msg, text_color="#EF4444"))

            threading.Thread(target=_task, daemon=True).start()

        btn_row = ctk.CTkFrame(card, fg_color="transparent")
        btn_row.pack(fill="x", padx=20, pady=(0, 12))

        btn_fetch = ctk.CTkButton(
            btn_row,
            text="🌐 Fetch & Import from Link",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#2563EB",
            hover_color="#1D4ED8",
            height=34,
            command=_do_url
        )
        btn_fetch.pack(side="left", padx=(0, 8))

        def _do_file():
            path = filedialog.askopenfilename(
                filetypes=[("Collection or OpenAPI", "*.json"), ("All Files", "*.*")]
            )
            if path:
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    imported = self.collection_manager.import_collection_format(data)
                    self._render_collection_tree()
                    if imported.get("items"):
                        self._load_request_into_ui(imported["id"], imported["items"][0]["id"])
                    self._show_status_banner(f"✓ Successfully imported '{imported.get('name')}' with {len(imported.get('items', []))} requests!", is_error=False)
                    self._hide_in_page_view()
                except Exception as err:
                    status_lbl.configure(text=f"File error: {str(err)}", text_color="#EF4444")

        btn_file = ctk.CTkButton(
            btn_row,
            text="📁 Select JSON File",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            height=34,
            command=_do_file
        )
        btn_file.pack(side="left", padx=(0, 8))

        def _do_paste_clipboard():
            try:
                raw_text = self.clipboard_get()
                if not raw_text or not raw_text.strip():
                    status_lbl.configure(text="Clipboard is empty.", text_color="#EF4444")
                    return
                data = json.loads(raw_text.strip())
                imported = self.collection_manager.import_collection_format(data)
                self._render_collection_tree()
                if imported.get("items"):
                    self._load_request_into_ui(imported["id"], imported["items"][0]["id"])
                self._show_status_banner(f"✓ Imported '{imported.get('name')}' from clipboard!", is_error=False)
                self._hide_in_page_view()
            except json.JSONDecodeError:
                status_lbl.configure(text="Clipboard does not contain valid JSON.", text_color="#EF4444")
            except Exception as ex:
                status_lbl.configure(text=f"Import failed: {ex}", text_color="#EF4444")

        btn_paste = ctk.CTkButton(
            btn_row,
            text="📋 Paste Raw JSON from Clipboard",
            font=ctk.CTkFont(family=APP_FONT, size=12, weight="bold"),
            fg_color="#F1F5F9",
            hover_color="#E2E8F0",
            text_color="#334155",
            height=34,
            command=_do_paste_clipboard
        )
        btn_paste.pack(side="left")
