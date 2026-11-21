import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import { translate, useLang, useT } from "../lib/i18n";

const INSTRUMENT_LABEL: Record<string, string> = {
  piano: "钢琴",
  guitar: "吉他",
  other: "其他",
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function fmtDuration(totalSeconds: number) {
  const lang = useLang.getState().lang;
  const tt = (k: string) => translate(lang, k);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h} ${tt("小时")} ${m} ${tt("分钟")}`;
  if (m > 0) return `${m} ${tt("分钟")}`;
  return `${totalSeconds} ${tt("秒")}`;
}

function fmtDay(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return WEEKDAYS[d.getDay()];
}

/// 练习统计:近 7 天柱状图 + 每曲合计列表(附录式排版,与设置页同语言)
export default function StatsPage() {
  const t = useT();
  const stats = useQuery({ queryKey: ["practiceStats"], queryFn: () => api.list_practice_stats() });
  const daily = useQuery({ queryKey: ["practiceDaily"], queryFn: () => api.practice_daily(7) });

  const rows = stats.data ?? [];
  const week = daily.data ?? [];
  const maxDay = Math.max(1, ...week.map((d) => d.seconds));
  const weekTotal = week.reduce((sum, d) => sum + d.seconds, 0);

  // 补全近 7 天(没有练习的日子是 0,图才连续)
  const days: { day: string; seconds: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, seconds: week.find((w) => w.day === key)?.seconds ?? 0 });
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl">
        <h1 className="font-disp text-xl font-black text-bind">{t("练习统计")}</h1>
        <div className="mt-3 border-t-4 border-double border-gold/45" />

        {/* 近 7 天 */}
        <section className="border-b border-hair py-5">
          <div className="text-sm font-semibold text-bind">{t("近 7 天")}</div>
          <div className="mt-1 text-xs text-bind/60">
            {t("共 {t}", { t: fmtDuration(weekTotal) })}
          </div>
          <div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label="近 7 天练习时长柱状图">
            {days.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-20 w-full items-end rounded-t-md bg-paper-dim/60">
                  <div
                    className="w-full rounded-t-md bg-ink transition-[height] duration-300"
                    style={{ height: `${Math.max(4, (d.seconds / maxDay) * 100)}%` }}
                    title={`${d.day}:${fmtDuration(d.seconds)}`}
                  />
                </div>
                <span className="text-[10px] text-bind/55">{fmtDay(d.day)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 每曲合计 */}
        <section className="border-b border-hair py-5">
          <div className="text-sm font-semibold text-bind">{t("每曲合计")}</div>
          {stats.isLoading ? (
            <div className="mt-3 text-sm text-bind/55">{t("加载中…")}</div>
          ) : rows.length === 0 ? (
            <div className="mt-3 text-sm text-bind/55">
              {t("还没有练习记录——打开一首曲子播放就会开始累计。")}
            </div>
          ) : (
            <ul className="mt-2">
              {rows.map((r) => (
                <li
                  key={r.scoreId}
                  className="flex items-baseline justify-between gap-3 border-b border-hair py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-bind">{r.title}</div>
                    <div className="mt-0.5 text-xs text-bind/55">
                      {INSTRUMENT_LABEL[r.instrument] ?? t("其他")} · {r.sessions} {t("次")} ·{" "}
                      {t("最近 {d}", { d: r.lastPlayedAt.slice(0, 10) })}
                    </div>
                  </div>
                  <div className="shrink-0 font-disp text-sm font-bold tabular-nums text-ink">
                    {fmtDuration(r.totalSeconds)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
