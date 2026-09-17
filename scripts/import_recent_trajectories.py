#!/usr/bin/env python3
"""Import reviewable trajectory evidence added after the original site export.

The deployed client uses gzip JSON assets.  Keeping the source in that same
form prevents a fresh build from accidentally publishing both large copies.
"""

from __future__ import annotations

import base64
import copy
import gzip
import hashlib
import json
import mimetypes
import re
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SITE = Path(__file__).resolve().parents[1]
CLIENT = SITE / "client"
WORK = Path("/Users/dylan/Documents/Codex/2026-09-15/ke/work")
FLASH = WORK / "raw_trajectory_export/multiroom_distinct_0915/active_results/rooms3_seed95516"
LUNA_INPUT = WORK / "luna_distinct_trial/input"
LUNA_OUTPUT = WORK / "raw_trajectory_export/multiroom_distinct_0915/luna_codex_trial"
SPATIAL = WORK / "spatialclaw_0825"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_asset_json(relative: str) -> Any:
    path = CLIENT / relative.lstrip("/")
    if path.exists():
        return read_json(path)
    with gzip.open(str(path) + ".gz", "rt", encoding="utf-8") as handle:
        return json.load(handle)


def write_asset_json(relative: str, value: Any) -> str:
    path = CLIENT / relative.lstrip("/")
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    path.unlink(missing_ok=True)
    with gzip.GzipFile(filename=str(path) + ".gz", mode="wb", mtime=0) as handle:
        handle.write(encoded.encode("utf-8"))
    return "/" + relative.lstrip("/")


def media_path(data: bytes, extension: str = "png") -> str:
    digest = hashlib.sha256(data).hexdigest()
    suffix = extension.lower().lstrip(".") or "bin"
    target = CLIENT / "media" / f"{digest}.{suffix}"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(data)
    return "/media/" + target.name


def copied_media(path: Path) -> str:
    return media_path(path.read_bytes(), path.suffix or ".png")


def data_uri_media(value: str) -> str:
    match = re.fullmatch(r"data:([^;,]+)?(?:;[^,]+)*;base64,(.*)", value, re.DOTALL)
    if not match:
        return value
    mime = match.group(1) or "image/png"
    extension = mimetypes.guess_extension(mime) or ".png"
    return media_path(base64.b64decode(match.group(2)), extension)


def replace_inline_images(value: Any) -> Any:
    if isinstance(value, str):
        return data_uri_media(value) if value.startswith("data:image/") else value
    if isinstance(value, list):
        return [replace_inline_images(item) for item in value]
    if isinstance(value, dict):
        return {key: replace_inline_images(item) for key, item in value.items()}
    return value


def message_images(messages: list[dict[str, Any]]) -> list[str]:
    images: list[str] = []
    for message in messages:
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if block.get("type") == "image_url":
                url = block.get("image_url", {}).get("url")
                if isinstance(url, str) and url.startswith("/media/"):
                    images.append(url)
    return images


def response_content(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if choices:
        return str((choices[0].get("message") or {}).get("content") or "")
    return str(response.get("content") or "")


def response_thinking(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if choices:
        return str((choices[0].get("message") or {}).get("reasoning_content") or "")
    return str(response.get("reasoning_content") or "")


def parsed_operation(text: str) -> dict[str, Any]:
    stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    try:
        value = json.loads(stripped)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def compact_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    keep = [
        "objects_pred", "objects_gt", "matched", "unlocalized", "object_precision",
        "object_recall", "object_f1", "pair_precision", "pair_recall", "pair_f1",
        "position_median", "position_p90", "position_rmse",
    ]
    return {key: metrics[key] for key in keep if key in metrics}


def import_flash() -> tuple[dict[str, Any], dict[str, Any]]:
    status = read_json(FLASH / "status.json")
    operations = {row["turn"]: row for row in (json.loads(line) for line in (FLASH / "operations.jsonl").read_text().splitlines())}
    history = [json.loads(line) for line in (FLASH / "public/history.jsonl").read_text().splitlines()]
    private_events = [json.loads(line) for line in (FLASH / "private/events.jsonl").read_text().splitlines()]
    review_poses = {}
    for event in private_events:
        pose = event.get("pose_private")
        frame = (event.get("public") or {}).get("frame")
        if frame is None or not isinstance(pose, list) or len(pose) < 3:
            continue
        review_poses[int(frame)] = {
            "camera_xy": [pose[0], pose[1]],
            "clockwise_heading_deg": pose[2],
            "distance_m": event.get("distance"),
            "provenance": "offline_renderer_pose",
        }
    gt = read_json(FLASH / "private/gt.json")
    write_asset_json("data/references/multiroom-distinct-95516.json", gt)

    frames = []
    for receipt in history:
        frame = receipt["frame"]
        public_receipt = {key: value for key, value in receipt.items() if key != "image"}
        exported_frame = {
            "id": frame,
            "image": copied_media(FLASH / receipt["image"]),
            "receipt": public_receipt,
            "evaluation": [
                {"kind": "fact", "text": "该 RGB 与执行回执是主动探索时公开提供给模型的记录。"},
                {"kind": "limit", "text": "房间布局、物体真值与离线评分在本次探索中均不可见。"},
            ],
        }
        if frame in review_poses:
            exported_frame["review_pose"] = review_poses[frame]
        frames.append(exported_frame)

    calls = []
    for request_dir in sorted((FLASH / "requests").iterdir()):
        turn = int(request_dir.name)
        request = replace_inline_images(read_json(request_dir / "request.json"))
        response = read_json(request_dir / "response_0.json")
        operation = operations.get(turn, {})
        answer = response_content(response)
        parsed = parsed_operation(answer)
        action = parsed.get("op", "unparsed_response")
        call_id = f"multiroom-distinct-95516-flash--{turn:03d}"
        request_url = write_asset_json(f"data/requests/{call_id}.json", request)
        detail = {
            "id": call_id,
            "request_url": request_url,
            "images": message_images(request.get("messages", [])),
            "thinking": response_thinking(response),
            "answer": answer,
            "tools": [{"name": "exploration_operation", "input": parsed}] if parsed else [],
            "response": response,
            "finish_reason": response.get("choices", [{}])[0].get("finish_reason"),
            "usage": operation.get("usage", {}).get("usage", response.get("usage", {})),
            "prediction": parsed.get("map"),
            "metrics": None,
            "evaluation": [
                {"kind": "fact", "text": f"这是 Gemini 3.8 Flash 的第 {turn + 1} 次原始服务调用；返回操作为 {action}。"},
                {"kind": "fact", "text": "完整输入保留了本次服务请求中的历史消息、公开执行回执与 RGB 图像。"},
                {"kind": "limit", "text": "接口没有返回思考正文；页面不对未返回的内部过程做补写。"},
            ],
        }
        detail_url = write_asset_json(f"data/calls/{call_id}.json", detail)
        calls.append({
            "id": call_id,
            "detail_url": detail_url,
            "request_url": request_url,
            "image_count": len(detail["images"]),
            "thinking_chars": len(detail["thinking"]),
            "tool_names": ["exploration_operation"] if parsed else [],
            "label": {"step": "移动 / 观察", "save_map": "保存地图", "finish": "结束并提交地图"}.get(action, "模型返回"),
            "time": response.get("created"),
            "budget": None,
            "status": "RECORDED",
            "preview": answer[:240],
        })

    checkpoints = []
    for saved in status.get("scored_maps", []):
        prediction = read_json(FLASH / saved["path"])
        checkpoints.append({
            "budget": saved["frame"],
            "prediction": prediction,
            "meta": {"actual_frames": saved["frame"], "early_stop": bool(status.get("early_stop")), "turn": saved["turn"]},
            "valid": True,
            "metrics": compact_metrics(saved.get("metrics", {})),
        })

    run_id = "multiroom-distinct-95516-flash"
    manifest = {
        "id": run_id,
        "case_id": "multiroom-distinct-95516",
        "model": "flash",
        "mode": "active_full_rgb",
        "kind": "active",
        "status": "COMPLETE",
        "description": "三间有差异的房间；Gemini 3.8 Flash 自行选择转向、移动、观察与保存地图。此记录在第 12 帧、17 次调用后由模型提前结束。",
        "state": {key: status.get(key) for key in ["model_requested", "rooms_private", "seed", "frames", "requests", "condition", "early_stop", "stop_reason"]},
        "isolation": {"private_world_absent": True, "gt_absent": True, "scores_absent": True, "network_not_used_for_task": True},
        "checkpoints": checkpoints,
        "frames": frames,
        "calls": calls,
        "reference_url": "/data/references/multiroom-distinct-95516.json",
    }
    manifest_url = write_asset_json(f"data/runs/{run_id}.json", manifest)
    index_run = {"id": run_id, "model": "flash", "mode": "active_full_rgb", "status": "COMPLETE", "frames": len(frames), "calls": len(calls), "manifest": manifest_url}
    return index_run, manifest


def import_luna() -> tuple[dict[str, Any], dict[str, Any]]:
    observations = read_json(LUNA_INPUT / "observations.json")
    images = [copied_media(LUNA_INPUT / view["image"]) for view in observations["views"]]
    prediction = read_json(LUNA_OUTPUT / "prediction.json")
    metrics = read_json(LUNA_OUTPUT / "metrics.json")
    reasoning = (LUNA_OUTPUT / "reasoning.md").read_text(encoding="utf-8")
    gt = read_json(FLASH / "private/gt.json")

    task = (
        "盲测：仅根据 observations.json 与四张 RGB 图恢复每个可见家具/物体实例的类别、"
        "初始相机坐标系中的近似 (x,y) 和 supporting view。不得读取其他文件、真值或网络。"
        "允许类别：chair, table, sofa, cabinet, plant, floor_lamp, stool, vase, other。"
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": task + "\n\n观测元数据：\n" + json.dumps(observations, ensure_ascii=False)}]
    content.extend({"type": "image_url", "image_url": {"url": image}} for image in images)
    request = {
        "source": "recorded Codex subagent blind-test task packet",
        "request_fidelity": "根据保存的观测清单与同一份盲测指令重建；不是服务商 HTTP 请求。",
        "messages": [{"role": "system", "content": "遵循用户的盲测约束，只提交带证据的地图 JSON。"}, {"role": "user", "content": content}],
    }
    run_id, call_id = "multiroom-distinct-95516-luna", "multiroom-distinct-95516-luna--static-4views"
    request_url = write_asset_json(f"data/requests/{call_id}.json", request)
    detail = {
        "id": call_id,
        "request_url": request_url,
        "request_fidelity": request["request_fidelity"],
        "images": images,
        "thinking": reasoning,
        "reasoning_visibility": "self_report",
        "answer": json.dumps(prediction, ensure_ascii=False, indent=2),
        "tools": [],
        "response": {"source": "saved Codex subagent output files", "prediction": prediction, "metrics": metrics},
        "finish_reason": "recorded_blind_test_submission",
        "usage": {},
        "prediction": prediction,
        "metrics": compact_metrics(metrics),
        "evaluation": [
            {"kind": "fact", "text": "该盲测只给出四张固定 RGB 与精确相机位姿；Luna 没有选择观察位置或移动。"},
            {"kind": "fact", "text": "页面显示的是保存的任务包和子代理书面说明，不伪装为服务商 API 原生请求。"},
            {"kind": "limit", "text": "四视角为 oracle-selected 输入，不能与主动探索的观测效率直接比较。"},
        ],
    }
    detail_url = write_asset_json(f"data/calls/{call_id}.json", detail)
    frames = [
        {
            "id": i + 1,
            "image": image,
            "receipt": {"status": "fixed_blind_test_view", "label": f"固定相机视角 {i + 1}", "camera": view},
            "evaluation": [{"kind": "fact", "text": "这是盲测预先选定的固定视角，并非模型主动请求的观察。"}],
        }
        for i, (image, view) in enumerate(zip(images, observations["views"]))
    ]
    manifest = {
        "id": run_id,
        "case_id": "multiroom-distinct-95516",
        "model": "luna",
        "mode": "static_exact4",
        "kind": "static",
        "status": "SNAPSHOT",
        "description": "GPT-5.6 Luna 的四视角盲测：输入为预先选择的四张 RGB 和准确相机位姿；没有探索行动。",
        "state": {"condition": "oracle-selected images, exact camera poses", "frames": 4, "model": "GPT-5.6 Luna"},
        "isolation": {"gt_absent": True, "other_runs_absent": True, "network_not_used_for_task": True},
        "checkpoints": [{"budget": 4, "prediction": prediction, "meta": {"actual_frames": 4, "early_stop": False}, "valid": True, "metrics": compact_metrics(metrics)}],
        "frames": frames,
        "calls": [{"id": call_id, "detail_url": detail_url, "request_url": request_url, "image_count": 4, "thinking_chars": len(reasoning), "tool_names": [], "label": "提交盲测地图", "status": "RECORDED", "preview": "四张固定视角的盲测提交"}],
        "reference_url": "/data/references/multiroom-distinct-95516.json",
    }
    manifest_url = write_asset_json(f"data/runs/{run_id}.json", manifest)
    return {"id": run_id, "model": "luna", "mode": "static_exact4", "status": "SNAPSHOT", "frames": 4, "calls": 1, "manifest": manifest_url}, manifest


def import_spatialclaw() -> tuple[dict[str, Any], dict[str, Any]]:
    audit = read_json(SPATIAL / "agent_spatialclaw_tools_v3.json")
    answers = {row["task_id"]: row for row in (json.loads(line) for line in (SPATIAL / "killgate_v3_answers.jsonl").read_text().splitlines())}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in audit["scored_tasks"]:
        merged = {**row, "answer": answers.get(row["task_id"])}
        grouped[row["pair_key"]].append(merged)

    run_id = "spatialclaw-0825-audit"
    calls, frames = [], []
    for position, pair_key in enumerate(sorted(grouped)):
        rows = grouped[pair_key]
        # The public export numbers panels 01..12 while the audit labels pairs 00..11.
        panel = SPATIAL / "v3_sheets" / f"pair_{position + 1:02d}.png"
        image = copied_media(panel)
        call_id = f"{run_id}--{pair_key}"
        request = {
            "source": "SpatialClaw capability audit public packet",
            "request_fidelity": "review packet reconstructed from exported pair panel and sealed answer rows; it is not a provider HTTP request.",
            "messages": [{"role": "user", "content": [{"type": "text", "text": f"公开审计面板 {pair_key}。请核对该对任务的封存输出。"}, {"type": "image_url", "image_url": {"url": image}}]}],
        }
        request_url = write_asset_json(f"data/requests/{call_id}.json", request)
        tool_names = sorted({tool for row in rows for tool in (row.get("answer") or {}).get("tools_used", [])})
        detail = {
            "id": call_id,
            "request_url": request_url,
            "request_fidelity": request["request_fidelity"],
            "images": [image],
            "thinking": "",
            "answer": json.dumps([{key: row.get(key) for key in ["task_id", "arm", "predicted_action", "expected_action", "correct", "answer"]} for row in rows], ensure_ascii=False, indent=2),
            "tools": [{"name": "audit_toolchain", "input": {"tools_used": tool_names}}],
            "response": {"source": "0825 SpatialClaw tool audit", "pair": pair_key, "rows": rows},
            "finish_reason": "sealed_audit_export",
            "usage": {},
            "prediction": None,
            "metrics": {"answers_in_pair": len(rows), "correct_in_pair": sum(bool(row["correct"]) for row in rows)},
            "evaluation": [
                {"kind": "fact", "text": f"{pair_key} 含两条封存答案；离线评分显示 {sum(bool(row['correct']) for row in rows)}/{len(rows)} 正确。"},
                {"kind": "limit", "text": "这是工具/状态能力审计，不是从空房间 RGB 建图的主动探索轨迹，不能作为空间建图公平基线。"},
                {"kind": "warning", "text": "审计中的视觉判断依赖 Codex 查看已索引面板，SpatialClaw 包装层没有完成目标定位、跨视角身份追踪、主动选视角或动作执行。"},
            ],
        }
        detail_url = write_asset_json(f"data/calls/{call_id}.json", detail)
        calls.append({"id": call_id, "detail_url": detail_url, "request_url": request_url, "image_count": 1, "thinking_chars": 0, "tool_names": ["audit_toolchain"], "label": f"{pair_key} · 两个封存动作答案", "status": "RECORDED", "preview": "; ".join(row["predicted_action"] for row in rows)})
        frames.append({"id": position + 1, "image": image, "receipt": {"status": "sealed_pair_panel", "label": f"公开审计面板 {pair_key}", "pair": pair_key}, "evaluation": detail["evaluation"]})

    manifest = {
        "id": run_id,
        "case_id": "spatialclaw-0825",
        "model": "spatialclaw",
        "mode": "tool_audit",
        "kind": "baseline",
        "status": "SNAPSHOT",
        "description": "SpatialClaw 0825 工具审计：公开 ToS 成对任务的封存输出与工具链核查。它检验的是已打包证据上的状态/操作流程，不是空环境的主动空间建图。",
        "state": {key: audit[key] for key in ["task_count", "answered_count", "correct_count", "action_accuracy", "pair_count", "paired_success", "pair_prediction_flip_rate", "best_constant_action_baseline"]},
        "isolation": {"private_packet_not_read_by_solver": True, "task_score_not_shown_during_solving": True},
        "checkpoints": [],
        "frames": frames,
        "calls": calls,
    }
    manifest_url = write_asset_json(f"data/runs/{run_id}.json", manifest)
    return {"id": run_id, "model": "spatialclaw", "mode": "tool_audit", "status": "SNAPSHOT", "frames": len(frames), "calls": len(calls), "manifest": manifest_url}, manifest


def main() -> None:
    index = read_asset_json("data/index.json")
    flash_run, flash_manifest = import_flash()
    luna_run, luna_manifest = import_luna()
    spatial_run, spatial_manifest = import_spatialclaw()
    index["cases"] = [case for case in index["cases"] if case["id"] not in {"multiroom-distinct-95516", "spatialclaw-0825"}]
    index["cases"].extend([
        {
            "id": "multiroom-distinct-95516",
            "title": "三房间差异布局 · 95516",
            "kind": "supplement",
            "description": "同一新场景中的真实 Flash 主动探索与 Luna 四视角盲测；条件不同，分开记录。",
            "runs": [flash_run, luna_run],
        },
        {
            "id": "spatialclaw-0825",
            "title": "SpatialClaw · 0825 工具审计",
            "kind": "baseline",
            "description": "已打包证据上的工具/状态能力审计，不是空环境主动建图比较。",
            "runs": [spatial_run],
        },
    ])
    index["summary"] = {
        "cases": len(index["cases"]),
        "runs": sum(len(case["runs"]) for case in index["cases"]),
        "calls": sum(run["calls"] for case in index["cases"] for run in case["runs"]),
    }
    index["snapshot_at"] = datetime.now(timezone.utc).isoformat()
    write_asset_json("data/index.json", index)
    print(json.dumps({"summary": index["summary"], "new_runs": [flash_manifest["id"], luna_manifest["id"], spatial_manifest["id"]]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
