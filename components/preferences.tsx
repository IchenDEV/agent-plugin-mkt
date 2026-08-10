"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("pluginsmp-theme", theme);
  window.dispatchEvent(new Event("pluginsmp-theme-change"));
}

function subscribeTheme(callback: () => void) {
  window.addEventListener("pluginsmp-theme-change", callback);
  return () => window.removeEventListener("pluginsmp-theme-change", callback);
}

function serverTheme(): Theme {
  return "light";
}

function SunIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4 fill-none stroke-current">
      <circle cx="10" cy="10" r="3.25" strokeWidth="1.5" />
      <path
        d="M10 2.25v1.5M10 16.25v1.5M2.25 10h1.5M16.25 10h1.5M4.52 4.52l1.06 1.06M14.42 14.42l1.06 1.06M15.48 4.52l-1.06 1.06M5.58 14.42l-1.06 1.06"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4 fill-none stroke-current">
      <path
        d="M16.55 12.42A6.75 6.75 0 0 1 7.58 3.45a6.75 6.75 0 1 0 8.97 8.97Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Preferences({ locale }: { locale: Locale }) {
  const router = useRouter();
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, serverTheme);

  const dark = theme === "dark";
  const themeLabel = locale === "zh-CN" ? (dark ? "切换到浅色模式" : "切换到深色模式") : dark ? "Switch to light mode" : "Switch to dark mode";

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    applyTheme(next);
  }

  function changeLocale(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-l border-gray-200 pl-2 sm:pl-3">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={themeLabel}
        title={themeLabel}
        className="grid size-8 place-items-center rounded-md text-gray-500 transition-colors hover:bg-surface hover:text-ink"
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
      <label className="sr-only" htmlFor="locale-select">
        {locale === "zh-CN" ? "语言" : "Language"}
      </label>
      <select
        id="locale-select"
        value={locale}
        onChange={(event) => changeLocale(event.target.value as Locale)}
        className="h-8 rounded-md border-0 bg-transparent px-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-surface hover:text-ink sm:text-[13px]"
      >
        <option value="en">EN</option>
        <option value="zh-CN">中文</option>
      </select>
    </div>
  );
}
