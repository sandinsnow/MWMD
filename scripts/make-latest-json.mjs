// 由 CI（.github/workflows/release.yml）调用：从环境变量生成自替换更新器读取的 latest.json。
// 仅做 JSON 组装，不触网；下载到 stdout 供 CI 重定向落盘。
const { VERSION, URL, SHA, PUB_DATE, NOTES } = process.env;

const required = { VERSION, URL, SHA };
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`make-latest-json: missing env ${k}`);
    process.exit(1);
  }
}

const latest = {
  version: VERSION,
  notes: NOTES || VERSION,
  pub_date: PUB_DATE || new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      url: URL,
      sha256: SHA,
    },
  },
};

process.stdout.write(JSON.stringify(latest, null, 2) + "\n");
