import os
import sys
from PIL import Image, ImageOps

def generate_assets(icon_path: str, output_dir: str):
    """Generates all required Windows MSIX package logo PNGs from app_icon.ico."""
    os.makedirs(output_dir, exist_ok=True)
    
    if not os.path.exists(icon_path):
        print(f"[Error] Icon path does not exist: {icon_path}")
        sys.exit(1)
        
    print(f"Loading base icon from: {icon_path}")
    base_img = Image.open(icon_path).convert("RGBA")
    
    # Define required MSIX visual elements
    # 1. Square icons (simple resize)
    square_targets = {
        "Square44x44Logo.png": (44, 44),
        "Square150x150Logo.png": (150, 150),
        "StoreLogo.png": (50, 50),
    }
    
    for filename, (w, h) in square_targets.items():
        resized = base_img.resize((w, h), Image.Resampling.LANCZOS)
        out_path = os.path.join(output_dir, filename)
        resized.save(out_path, "PNG")
        print(f"  Generated {filename} ({w}x{h})")
        
    # 2. Rectangular canvas icons (SplashScreen & Wide310x150)
    bg_color = (15, 23, 42, 255)  # Sleek dark slate #0F172A matching app theme
    
    # Wide tile: 310x150 (icon centered at ~100x100)
    wide_img = Image.new("RGBA", (310, 150), bg_color)
    icon_wide = base_img.resize((110, 110), Image.Resampling.LANCZOS)
    wide_img.paste(icon_wide, ((310 - 110) // 2, (150 - 110) // 2), icon_wide)
    wide_img.save(os.path.join(output_dir, "Wide310x150Logo.png"), "PNG")
    print("  Generated Wide310x150Logo.png (310x150)")
    
    # Splash screen: 620x300 (icon centered at ~160x160)
    splash_img = Image.new("RGBA", (620, 300), bg_color)
    icon_splash = base_img.resize((160, 160), Image.Resampling.LANCZOS)
    splash_img.paste(icon_splash, ((620 - 160) // 2, (300 - 160) // 2), icon_splash)
    splash_img.save(os.path.join(output_dir, "SplashScreen.png"), "PNG")
    print("  Generated SplashScreen.png (620x300)")
    
    print("All MSIX visual assets generated successfully!")

if __name__ == "__main__":
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    icon_file = os.path.join(project_root, "app_icon.ico")
    target_assets_dir = os.path.join(project_root, "Assets")
    generate_assets(icon_file, target_assets_dir)
