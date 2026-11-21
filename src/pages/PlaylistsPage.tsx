import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import { useT } from "../lib/i18n";
import { useUi } from "../stores/ui";
import ConfirmDialog from "../components/ConfirmDialog";

const STATUS_STYLE: Record<string, string> = {
  imported: "bg-spot-wait/15 text-spot-wait",
  processing: "bg-spot-run/15 text-spot-run",
  ready: "bg-spot-ok/15 text-spot-ok",
  failed: "bg-spot-fail/15 text-spot-fail",
};
const STATUS_LABEL: Record<string, string> = {
  imported: "待识别",
  processing: "识别中",
  ready: "可播放",
  failed: "识别失败",
};

/// 歌单页:左侧歌单列表(新建/删除),右侧曲目(顺序、移除、连播入口)
export default function PlaylistsPage() {
  const t = useT();
  const openScore = useUi((s) => s.openScore);
  const showToast = useUi((s) => s.showToast);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const playlists = useQuery({ queryKey: ["playlists"], queryFn: () => api.list_playlists() });
  const items = useQuery({
    queryKey: ["playlistItems", selectedId],
    queryFn: () => api.list_playlist_items(selectedId!),
    enabled: !!selectedId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["playlists"] });
    queryClient.invalidateQueries({ queryKey: ["playlistItems", selectedId] });
  };

  const create = useMutation({
    mutationFn: () => api.create_playlist(newName.trim()),
    onSuccess: (p) => {
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setSelectedId(p.id);
      showToast({ message: t("已创建歌单「{t}」", { t: p.name }) });
    },
    onError: (e) => showToast({ message: String(e) }, 6000),
  });

  const removePlaylist = useMutation({
    mutationFn: (id: string) => api.delete_playlist(id),
    onSuccess: (_res, id) => {
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      if (selectedId === id) setSelectedId(null);
      showToast({ message: t("已删除歌单(曲目不受影响)") });
    },
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.remove_from_playlist(itemId),
    onSuccess: () => invalidate(),
  });

  const selected = playlists.data?.find((p) => p.id === selectedId) ?? null;
  const list = items.data ?? [];

  const startPlayThrough = () => {
    const playable = list.filter((it) => it.score.status === "ready");
    if (playable.length === 0) return;
    // 连播队列进 ui store,详情页播完自动切下一首
    useUi.setState({
      playQueue: { ids: playable.map((it) => it.score.id), index: 0 },
    });
    openScore(playable[0].score.id);
  };

  return (
    <div className="flex h-full">
      {/* 左:歌单列表 */}
      <aside className="w-64 shrink-0 border-r border-hair p-5">
        <h1 className="font-disp text-xl font-black text-bind">{t("歌单")}</h1>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("新歌单名称")}
            aria-label={t("新歌单名称")}
            className="min-w-0 flex-1 rounded-lg border border-hair-strong bg-paper-bright px-2.5 py-1.5 text-sm text-bind outline-none placeholder:text-bind/40 focus:border-ink"
          />
          <button
            type="submit"
            disabled={!newName.trim() || create.isPending}
            className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-paper hover:bg-ink-bright disabled:opacity-50"
          >
            {t("新建")}
          </button>
        </form>
        <ul className="mt-4">
          {(playlists.data ?? []).map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  selectedId === p.id
                    ? "bg-ink/10 font-semibold text-ink"
                    : "text-bind/80 hover:bg-paper-dim"
                }`}
              >
                <span className="truncate">{p.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-bind/50">{p.itemCount}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t("删除歌单 {t}", { t: p.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting({ id: p.id, name: p.name });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setDeleting({ id: p.id, name: p.name });
                      }
                    }}
                    className="text-bind/30 opacity-0 transition group-hover:opacity-100 hover:text-spot-fail"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </span>
                </span>
              </button>
            </li>
          ))}
          {playlists.data && playlists.data.length === 0 && (
            <li className="mt-2 text-xs text-bind/55">
              {t("还没有歌单——建一个「今晚练的」吧。")}
            </li>
          )}
        </ul>
      </aside>

      {/* 右:曲目 */}
      <main className="min-w-0 flex-1 overflow-auto p-6">
        {selected ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-disp text-lg font-black text-bind">{selected.name}</h2>
              {list.some((it) => it.score.status === "ready") && (
                <button
                  onClick={startPlayThrough}
                  className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-paper hover:bg-ink-bright"
                >
                  {t("连播")}
                </button>
              )}
            </div>
            <ol className="mt-4">
              {list.map((it, i) => (
                <li
                  key={it.id}
                  className="group flex items-center gap-3 border-b border-hair py-3 last:border-0"
                >
                  <span className="w-6 shrink-0 text-right font-disp text-sm font-bold tabular-nums text-bind/40">
                    {i + 1}
                  </span>
                  <button
                    onClick={() => openScore(it.score.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-semibold text-bind hover:text-ink">
                      {it.score.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-bind/55">
                      <span>{it.score.composer ?? t("佚名")}</span>
                      <span className={STATUS_STYLE[it.score.status]}>
                        {t(STATUS_LABEL[it.score.status])}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => removeItem.mutate(it.id)}
                    aria-label={t("从歌单移除 {t}", { t: it.score.title })}
                    className="shrink-0 text-bind/30 opacity-0 transition group-hover:opacity-100 hover:text-spot-fail"
                    title={t("移出歌单")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </li>
              ))}
              {list.length === 0 && (
                <li className="mt-2 text-sm text-bind/55">
                  {t("歌单是空的——在曲库卡片或详情页「⋯」里选「加入歌单」。")}
                </li>
              )}
            </ol>
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm text-bind/55">
            {t("左侧选一个歌单,或新建一个。")}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={deleting !== null}
        title={t("删除歌单")}
        message={t("将删除歌单「{t}」。歌单里的曲谱不受影响。", { t: deleting?.name ?? "" })}
        confirmLabel={t("删除歌单")}
        busy={removePlaylist.isPending}
        onConfirm={() => deleting && removePlaylist.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
