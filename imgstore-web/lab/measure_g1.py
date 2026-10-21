#!/usr/bin/env python3
"""Đo độ lệch grid line tại mép pane — bằng chứng Gate G1.

Ý tưởng: grid line dọc chạy thẳng (x cố định) ở mọi hàng NGOÀI pane.
Khi đi vào vùng mép pane, line bị uốn → vị trí x của line dịch đi.
Đo shift tối đa theo hàng quanh mép panel 360x240 r36 (edgeBand 22).

Panel ở pane-row top 48%, left 8% của stage 1280 rộng → x_pane0 ≈ 102.
Ảnh chụp viewport 1280x720+ nên cần phát hiện động thay vì hardcode.
"""
import sys
from PIL import Image

def find_grid_lines(img, y, x_range, thresh=90):
    """Trả về list x nơi pixel sáng (grid line trắng) tại hàng y."""
    px = img.load()
    lines = []
    prev_dark = True
    for x in x_range:
        r, g, b = px[x, y][:3]
        bright = (r + g + b) / 3
        if bright > thresh and prev_dark:
            lines.append(x)
            prev_dark = False
        elif bright <= thresh:
            prev_dark = True
    return lines

def line_x_near(lines, x0, tol=14):
    """Tìm grid line gần x0 nhất trong tol."""
    best = None
    for x in lines:
        if abs(x - x0) <= tol and (best is None or abs(x - x0) < abs(best - x0)):
            best = x
    return best

def main(on_path, off_path):
    on = Image.open(on_path).convert('RGB')
    off = Image.open(off_path).convert('RGB')
    w, h = on.size
    print(f"image {w}x{h}")

    # Chọn một grid line dọc ở nửa trái panel: quét hàng y=150 (trên pane-row 48%)
    # để tìm các line, rồi chọn line nằm trong vùng mép trái panel.
    # Panel bắt đầu quanh x≈102 (8% của 1280). Mép trong band 22px → x≈102..124.
    ref_y = 150  # hàng tham chiếu phía trên panel (panel top ≈ 0.48*stage; stage ~ 1160 css)
    lines_ref = find_grid_lines(off, ref_y, range(0, w))
    print("grid lines tại y=150 (off):", lines_ref[:12])

    # Chọn line đầu tiên sau x=115 (mép trái panel band)
    target = None
    for x in lines_ref:
        if 112 <= x <= 124:
            target = x
            break
    if target is None:
        # fallback: line gần 118 nhất
        target = min(lines_ref, key=lambda x: abs(x - 118))
    print(f"grid line mục tiêu x={target}")

    # Quét các hàng đi qua panel (tìm top/bottom panel bằng ảnh off: vùng sáng blur)
    # Đơn giản: quét y từ 40% đến 75% chiều cao
    y0, y1 = int(h * 0.40), int(h * 0.75)
    shifts = []
    for y in range(y0, y1, 4):
        lines_on = find_grid_lines(on, y, range(target - 16, target + 17))
        x_on = line_x_near(lines_on, target)
        if x_on is not None:
            shifts.append((y, x_on - target))
    if not shifts:
        print("KHÔNG tìm thấy grid line trong vùng quét — kiểm tra tọa độ")
        return 1
    max_shift = max(shifts, key=lambda t: abs(t[1]))
    nonzero = [s for s in shifts if abs(s[1]) >= 2]
    print(f"số hàng đo được: {len(shifts)}, hàng có shift>=2px: {len(nonzero)}")
    print(f"max shift: {max_shift[1]}px tại y={max_shift[0]}")
    print("mẫu shifts:", shifts[:: max(1, len(shifts)//12)])
    ok = len(nonzero) >= 4 and abs(max_shift[1]) >= 3
    print("G1 edge-bend:", "PASS" if ok else "FAIL")
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
