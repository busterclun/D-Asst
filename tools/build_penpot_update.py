from __future__ import annotations

import json
import shutil
import uuid
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "D-Asst Design System.penpot"
OUTPUT = ROOT / "D-Asst Design System - Updated.penpot"
FILE_ID = "3ae82a3c-f269-803b-8008-ecddfe4ee1a1"
PAGES = {
    "product": "3ae82a3c-f269-803b-8008-ecddfe81e7ca",
    "landing": "3ae82a3c-f269-803b-8008-ecddfe81e7cb",
}
ROOT_ID = "00000000-0000-0000-0000-000000000000"


def uid() -> str:
    return str(uuid.uuid4())


def frame(node_id: str, page_id: str, name: str, x: float, y: float, w: float, h: float,
          fill: str, children: list[str]) -> dict:
    return {
        "id": node_id,
        "name": name,
        "type": "frame",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "rotation": 0,
        "selrect": {"x": x, "y": y, "width": w, "height": h, "x1": x, "y1": y, "x2": x + w, "y2": y + h},
        "points": [{"x": x, "y": y}, {"x": x + w, "y": y}, {"x": x + w, "y": y + h}, {"x": x, "y": y + h}],
        "transform": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
        "transformInverse": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
        "parentId": ROOT_ID,
        "frameId": ROOT_ID,
        "pageId": page_id,
        "hideFillOnExport": False,
        "hidden": False,
        "opacity": 1,
        "proportion": 1,
        "r1": 18,
        "r2": 18,
        "r3": 18,
        "r4": 18,
        "fills": [{"fillColor": fill, "fillOpacity": 1}],
        "strokes": [],
        "shadow": [],
        "shapes": children,
    }


def text(node_id: str, page_id: str, parent_id: str, value: str, x: float, y: float,
         w: float, h: float, size: int = 18, color: str = "#263128", weight: str = "400") -> dict:
    span = {
        "lineHeight": "1.4285714285714286",
        "fontStyle": "normal",
        "textTransform": "none",
        "textAlign": "left",
        "fontId": "gfont-noto-sans-sc",
        "fontSize": str(size),
        "fontWeight": weight,
        "fontVariantId": weight,
        "textDecoration": "none",
        "letterSpacing": "0",
        "fills": [{"fillColor": color, "fillOpacity": 1}],
        "fontFamily": "Noto Sans SC",
        "text": value,
    }
    paragraph = {
        "lineHeight": "1.4285714285714286",
        "fontStyle": "normal",
        "children": [span],
        "textTransform": "none",
        "textAlign": "left",
        "fontId": "gfont-noto-sans-sc",
        "fontSize": str(size),
        "fontWeight": weight,
        "fontVariantId": weight,
        "textDecoration": "none",
        "letterSpacing": "0",
        "fills": [{"fillColor": color, "fillOpacity": 1}],
        "fontFamily": "Noto Sans SC",
        "type": "paragraph",
    }
    return {
        "id": node_id,
        "name": value[:32],
        "type": "text",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "rotation": 0,
        "selrect": {"x": x, "y": y, "width": w, "height": h, "x1": x, "y1": y, "x2": x + w, "y2": y + h},
        "points": [{"x": x, "y": y}, {"x": x + w, "y": y}, {"x": x + w, "y": y + h}, {"x": x, "y": y + h}],
        "transform": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
        "transformInverse": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
        "parentId": parent_id,
        "frameId": parent_id,
        "pageId": page_id,
        "hidden": False,
        "opacity": 1,
        "proportion": 1,
        "content": {"type": "root", "verticalAlign": "top", "children": [{"type": "paragraph-set", "children": [paragraph]}]},
        "fills": [{"fillColor": color, "fillOpacity": 1}],
        "strokes": [],
        "shadow": [],
        "touched": [],
    }


def screen(page_id: str, name: str, x: float, y: float, w: float, h: float, fill: str,
           title: str, subtitle: str, body: list[str], accent: str = "#465c47") -> tuple[dict, list[dict]]:
    screen_id = uid()
    ids = [uid() for _ in range(3 + len(body))]
    nodes = [
        text(ids[0], page_id, screen_id, title, x + 32, y + 28, w - 64, 36, 28, accent, "700"),
        text(ids[1], page_id, screen_id, subtitle, x + 32, y + 78, w - 64, 28, 14, "#6b756e", "400"),
        text(ids[2], page_id, screen_id, "D-Asst · DESIGN PREVIEW · 水印", x + 32, y + h - 34, w - 64, 20, 11, "#8b958e", "500"),
    ]
    for i, line in enumerate(body):
        nodes.append(text(ids[3 + i], page_id, screen_id, line, x + 32, y + 132 + i * 38, w - 64, 28, 16, "#263128", "500"))
    return frame(screen_id, page_id, name, x, y, w, h, fill, [n["id"] for n in nodes]), nodes


def make_page(page_id: str, screens: list[tuple]) -> tuple[dict, list[dict]]:
    root_path = f"files/{FILE_ID}/pages/{page_id}/{ROOT_ID}.json"
    root = {
        "id": ROOT_ID,
        "name": "Root Frame",
        "type": "frame",
        "x": 0,
        "y": 0,
        "width": 0.01,
        "height": 0.01,
        "rotation": 0,
        "selrect": {"x": 0, "y": 0, "width": 0.01, "height": 0.01, "x1": 0, "y1": 0, "x2": 0.01, "y2": 0.01},
        "points": [{"x": 0, "y": 0}, {"x": 0.01, "y": 0}, {"x": 0.01, "y": 0.01}, {"x": 0, "y": 0.01}],
        "transform": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
        "transformInverse": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
        "parentId": ROOT_ID,
        "frameId": ROOT_ID,
        "pageId": page_id,
        "r1": 0,
        "r2": 0,
        "r3": 0,
        "r4": 0,
        "fills": [{"fillColor": "#FFFFFF", "fillOpacity": 1}],
        "strokes": [],
        "shapes": [s[0]["id"] for s in screens],
    }
    nodes = [root]
    for frame_node, child_nodes in screens:
        nodes.append(frame_node)
        nodes.extend(child_nodes)
    return root, nodes


def main() -> None:
    product_specs = [
        ("[P0] Today Dashboard", 80, 80, 960, 560, "#ffffff", "今天 · 11 月 11 日", "把注意力放回下一件重要的事", ["+ 新建任务", "今日任务  5 项   已完成 2 项", "08:30–09:15  复现 case", "10:00–11:00  看会议 PPT", "15:00  健身 · 仅提醒，不打扰"]),
        ("[P0] Create Task", 1120, 80, 560, 560, "#f7f7f5", "新建任务", "默认只编辑此次重复任务", ["任务名称  写下你要推进的事", "日期与时间  今天  15:00", "重复  每天 · 可改为整个系列", "提醒  仅提醒，无完成/失败按钮", "保存任务"]),
        ("[P0] Task Detail", 80, 720, 760, 460, "#ffffff", "看会议 PPT", "重要但不紧急 · 工作", ["重复：每周一  仅此次", "通知：15 分钟前 · 仅提醒", "备注：整理会议结论并同步到项目", "编辑范围：仅此次 / 整个系列"]),
        ("[P0] Week Planner", 880, 720, 800, 460, "#ffffff", "周视图 · 可拖动时间块", "拖动任务即可调整开始时间与时长", ["周一  09:00 复现 case", "周二  10:00 看会议 PPT", "周三  15:00 健身", "拖动后自动更新提醒 · 支持深色模式"]),
        ("[P0] Quadrant Board", 80, 1260, 760, 460, "#ffffff", "事项-四象限", "重要性与紧急性一眼分清", ["Ⅰ 重要且紧急   保密学习 · 空间制冷作业", "Ⅱ 重要不紧急   流动反向整理 · 符号回归", "Ⅲ / Ⅳ  可折叠 · 支持拖拽归类"]),
        ("[P1] Dark Mode Settings", 880, 1260, 800, 460, "#202522", "外观与通知", "变量模式保留 Light / Dark 两套主题", ["主题  跟随系统 · 浅色 · 深色", "关闭窗口  首次询问后记住选择", "水印  公开预览始终显示", "保存偏好"]),
    ]
    landing_specs = [
        ("[P0] Landing Hero", 80, 80, 1520, 520, "#202522", "D-Asst", "Windows 上的 AI 智能工作提醒与时间管理", ["把任务、时间和注意力放在同一张桌面上。", "加入测试名单", "查看设计预览", "D-Asst · DESIGN PREVIEW · 水印"], "#dce8dc"),
        ("[P0] Feature Preview", 80, 660, 720, 440, "#ffffff", "为下一步保留空间", "日 / 周 / 月视图，按你的节奏工作", ["AI 将碎片输入整理成可执行任务", "周视图支持拖动时间块", "通知只提醒，不制造额外选择"], "#465c47"),
        ("[P0] Handoff Notes", 840, 660, 760, 440, "#f7f7f5", "设计交接", "组件、变量与交互规则已保留", ["颜色与间距使用 Design Tokens", "Light / Dark 变量模式", "关闭窗口与重复任务规则", "公开发布版本带水印"], "#465c47"),
    ]
    product_screens = [screen(PAGES["product"], *s) for s in product_specs]
    landing_screens = [screen(PAGES["landing"], *s) for s in landing_specs]
    pages = {PAGES["product"]: make_page(PAGES["product"], product_screens)[1], PAGES["landing"]: make_page(PAGES["landing"], landing_screens)[1]}

    if OUTPUT.exists():
        OUTPUT.unlink()
    with zipfile.ZipFile(SOURCE, "r") as zin, zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        replace_paths = set()
        for page_id, nodes in pages.items():
            prefix = f"files/{FILE_ID}/pages/{page_id}/"
            for n in nodes:
                replace_paths.add(prefix + n["id"] + ".json")
        for item in zin.infolist():
            # Replace the tiny placeholder root files and omit any old generated nodes.
            if any(item.filename.startswith(f"files/{FILE_ID}/pages/{page_id}/") for page_id in pages):
                if item.filename.endswith("/{0}.json".format(ROOT_ID)):
                    continue
                if item.filename.split("/")[-1].endswith(".json") and item.filename.count("/") >= 4:
                    continue
            zout.writestr(item, zin.read(item.filename))
        for page_id, nodes in pages.items():
            prefix = f"files/{FILE_ID}/pages/{page_id}/"
            for node in nodes:
                zout.writestr(prefix + node["id"] + ".json", json.dumps(node, ensure_ascii=False, separators=(",", ":")))
    print(f"Created {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
