"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Card } from "@/components/ui";
import type { Locale } from "@/lib/i18n";
import type { InstallRuntime } from "@/lib/marketplaces";

interface InstallOption {
  runtime: InstallRuntime;
  label: string;
  command: string;
}

export function InstallCommand({
  options,
  locale,
}: {
  options: InstallOption[];
  locale: Locale;
}) {
  const zh = locale === "zh-CN";
  const [selectedRuntime, setSelectedRuntime] = useState(options[0]?.runtime);
  const selected =
    options.find((option) => option.runtime === selectedRuntime) ?? options[0];
  if (!selected) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div
          role="tablist"
          aria-label={zh ? "选择安装客户端" : "Choose an install client"}
          className="flex rounded-lg bg-gray-100 p-1"
        >
          {options.map((option) => {
            const active = option.runtime === selected.runtime;
            return (
              <button
                key={option.runtime}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedRuntime(option.runtime)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-action text-on-action shadow-sm"
                    : "text-gray-600 hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-gray-500">
          {zh ? "默认安装到当前用户" : "Installs for the current user"}
        </span>
      </div>

      <div
        role="tabpanel"
        className="flex min-w-0 items-start gap-3 bg-code px-4 py-3.5"
      >
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs leading-6 text-code-ink">
          <code>{selected.command}</code>
        </pre>
        <CopyButton
          text={selected.command}
          label={zh ? "复制安装命令" : "Copy install commands"}
          copiedLabel={zh ? "已复制" : "Copied"}
          errorLabel={zh ? "复制失败" : "Copy failed"}
        />
      </div>

      <p className="border-t border-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
        {zh
          ? `复制后粘贴到 ${selected.label} 的终端中运行。命令会添加并刷新 PluginsMP 目录，然后安装这个插件。`
          : `Paste and run these commands in a terminal with ${selected.label}. They add and refresh the PluginsMP catalog, then install this plugin.`}
      </p>
    </Card>
  );
}
