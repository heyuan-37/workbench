const DB_NAME = "personal_workbench";
const DB_VERSION = 1;
const STORES = ["projects", "tasks", "ideas", "reviews", "habits", "settings"];

let db = null;
let currentDomain = "全部";
let currentIdeaId = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      STORES.forEach((name) => {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: "id", autoIncrement: true });
        }
      });
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function store(name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

function getAll(name) {
  return new Promise((resolve, reject) => {
    const r = store(name).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

function getOne(name, id) {
  return new Promise((resolve, reject) => {
    const r = store(name).get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function putOne(name, obj) {
  return new Promise((resolve, reject) => {
    const r = store(name, "readwrite").put(obj);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function countStore(name) {
  return new Promise((resolve, reject) => {
    const r = store(name).count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function clearStore(name) {
  return new Promise((resolve, reject) => {
    const r = store(name, "readwrite").clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function fmtDate(value) {
  if (!value) return "未设置";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateTime(value) {
  if (!value) return "还没有备份";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function renderToday() {
  const [projects, tasks, ideas] = await Promise.all([
    getAll("projects"),
    getAll("tasks"),
    getAll("ideas"),
  ]);

  const openTasks = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    })
    .slice(0, 5);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const doneCount = tasks.filter((t) => t.status === "done").length;

  let html = `
    <div class="stat-grid">
      <div class="stat"><strong>${projects.length}</strong><span>项目</span></div>
      <div class="stat"><strong>${tasks.filter(t => t.status !== "done").length}</strong><span>未完成任务</span></div>
      <div class="stat"><strong>${ideas.filter(i => i.status === "未整理").length}</strong><span>收件箱</span></div>
    </div>
    <div class="card">
      <div class="card-title">今日先看这些 <span class="badge">完成 ${doneCount}</span></div>
      <p class="hint">里程碑 1 先显示未完成任务。自动排序、打断重排会在下一阶段加。</p >
    </div>
  `;

  if (!openTasks.length) {
    html += `<div class="empty">今天还没有未完成任务。去项目里加任务，或点右下角“＋”记想法。</div>`;
  } else {
    html += openTasks.map((t) => {
      const p = projectMap[t.projectId];
      return `
        <div class="card clickable" onclick="window.openTaskDetail(${t.id})">
          <div class="card-title">${escapeHtml(t.title)} <span class="badge">${escapeHtml(t.priority || "中")}</span></div>
          <div class="card-sub">
            项目：${p ? escapeHtml(p.name) : "未归属"}<br>
            截止：${fmtDate(t.deadline)} ｜ 预计：${t.estimate ? t.estimate + " 分钟" : "未填"}<br>
            下一步：${escapeHtml(t.nextAction || "还没写下一步")}
          </div>
        </div>
      `;
    }).join("");
  }

  document.getElementById("todayContent").innerHTML = html;
}

async function renderProjects() {
  const [projects, tasks] = await Promise.all([getAll("projects"), getAll("tasks")]);
  const filtered = currentDomain === "全部"
    ? projects
    : projects.filter((p) => p.domain === currentDomain);

  document.querySelectorAll("#domainBar .chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.domain === currentDomain);
  });

  if (!filtered.length) {
    document.getElementById("projectList").innerHTML =
      `<div class="empty">这个领域还没有项目。点右上角“＋新建项目”。</div>`;
    return;
  }

  document.getElementById("projectList").innerHTML = filtered.map((p) => {
    const list = tasks.filter((t) => t.projectId === p.id);
    const done = list.filter((t) => t.status === "done").length;
    const percent = list.length ? Math.round((done / list.length) * 100) : 0;
    return `
      <div class="card clickable" onclick="window.openProjectDetail(${p.id})">
        <div class="card-title">${escapeHtml(p.name)} <span class="badge">${escapeHtml(p.domain || "")}</span></div>
        <div class="card-sub">
          目标：${escapeHtml(p.goal || "未填写")}<br>
          进度：${percent}%（${done}/${list.length}）<br>
          截止：${fmtDate(p.deadline)}<br>
          下一步：${escapeHtml(p.nextAction || "还没写下一步")}
        </div>
      </div>
    `;
  }).join("");
}

async function renderInbox() {
  const ideas = (await getAll("ideas"))
    .filter((i) => i.status === "未整理")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!ideas.length) {
    document.getElementById("inboxList").innerHTML =
      `<div class="empty">收件箱是空的。点右下角“＋”先记一条，不用马上整理。</div>`;
    return;
  }

  document.getElementById("inboxList").innerHTML = ideas.map((idea) => `
    <div class="card">
      <div class="card-sub">${fmtDateTime(idea.createdAt)}</div>
      <div class="idea-text">${escapeHtml(idea.text)}</div>
      <div class="row-buttons">
        <button class="primary small" onclick="window.convertIdea(${idea.id})">转任务</button>
        <button class="secondary small" onclick="window.archiveIdea(${idea.id})">存档</button>
      </div>
    </div>
  `).join("");
}

async function renderReview() {
  document.getElementById("reviewContent").innerHTML = `
    <div class="card">
      <div class="card-title">每日复盘</div>
      <p class="card-sub">这个模块会在里程碑 3 开放：自动带出完成/未完成、情绪精力、生成明日草稿。</p >
    </div>
    <div class="empty">第一版先跑通任务、项目、收件箱和备份。</div>
  `;
}

async function renderSettings() {
  const [projects, tasks, ideas, reviews, habits, lastBackup] = await Promise.all([
    countStore("projects"),
    countStore("tasks"),
    countStore("ideas"),
    countStore("reviews"),
    countStore("habits"),
    getOne("settings", "lastBackup"),
  ]);

  document.getElementById("settingsContent").innerHTML = `
    <div class="card">
      <div class="card-title">数据与备份</div>
      <div class="card-sub">
        项目 ${projects} ｜ 任务 ${tasks} ｜ 想法 ${ideas} ｜ 复盘 ${reviews} ｜ 习惯 ${habits}<br>
        上次备份：${fmtDateTime(lastBackup ? lastBackup.value : null)}
      </div>
      <div class="row-buttons">
        <button class="primary small" id="exportBtn">一键备份</button>
        <button class="secondary small" id="importBtn">一键恢复</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden />
      </div>
      <p class="hint">备份会下载一个 JSON 文件。恢复会覆盖当前数据，恢复前会自动先导出一份当前数据。</p >
    </div>
    <div class="card">
      <div class="card-title">说明</div>
      <div class="card-sub">
        数据存在这台手机的浏览器本地。卸载浏览器、清理站点数据、换手机前，请先备份。<br>
        联网 AI、提醒、复盘模板在下一阶段加入。
      </div>
    </div>
  `;

  document.getElementById("exportBtn").onclick = () => exportBackup();
  document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();
  document.getElementById("importFile").onchange = handleImportFile;
}

async function renderAll() {
  await Promise.all([
    renderToday(),
    renderProjects(),
    renderInbox(),
    renderReview(),
    renderSettings(),
  ]);
}

async function exportBackup() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
  };
  for (const name of STORES) {
    data[name] = await getAll(name);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `工作台备份-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  await putOne("settings", { id: "lastBackup", value: new Date().toISOString() });
  await renderSettings();
  alert("备份文件已下载。请把它保存到网盘或电脑。");
}

async function restoreBackup(data) {
  for (const name of STORES) {
    await clearStore(name);
  }
  for (const name of STORES) {
    const rows = Array.isArray(data[name]) ? data[name] : [];
    for (const row of rows) {
      await putOne(name, row);
    }
  }
}

async function handleImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    alert("这个文件不是有效的工作台备份。");
    e.target.value = "";
    return;
  }

  if (!confirm("恢复会覆盖当前数据。恢复前会先自动导出当前数据。继续吗？")) {
    e.target.value = "";
    return;
  }

  await exportBackup();
  await restoreBackup(data);
  await renderAll();
  alert("恢复完成。");
  e.target.value = "";
}

async function openProjectDetail(id) {
  const [project, tasks] = await Promise.all([getOne("projects", id), getAll("tasks")]);
  if (!project) return;
  const list = tasks.filter((t) => t.projectId === id);
  const done = list.filter((t) => t.status === "done").length;
  const percent = list.length ? Math.round((done / list.length) * 100) : 0;

  document.getElementById("projectDetailContent").innerHTML = `
    <div class="card">
      <div class="card-title">${escapeHtml(project.name)}</div>
      <div class="card-sub">
        领域：${escapeHtml(project.domain || "")}<br>
        目标：${escapeHtml(project.goal || "未填写")}<br>
        进度：${percent}%（${done}/${list.length}）<br>
        截止：${fmtDate(project.deadline)}<br>
        下一步：${escapeHtml(project.nextAction || "还没写下一步")}
      </div>
      <div class="row-buttons">
        <button class="primary small" onclick="window.openTaskForm(null, ${project.id})">＋新建任务</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">任务列表</div>
      ${list.length ? list.map((t) => `
        <div class="task-line clickable" onclick="window.openTaskDetail(${t.id})">
          <div>
            <div>${t.status === "done" ? "✓ " : ""}${escapeHtml(t.title)}</div>
            <div class="hint">截止：${fmtDate(t.deadline)} ｜ 优先级：${escapeHtml(t.priority || "中")}</div>
          </div>
          <span class="badge ${t.status === "done" ? "done" : ""}">${t.status === "done" ? "已完成" : "进行中"}</span>
        </div>
      `).join("") : `<div class="empty">还没有任务，先加一个任务。</div>`}
    </div>
  `;
  openModal("projectDetailModal");
}

async function openTaskForm(ideaId = null, projectId = null, prefillTitle = "") {
  currentIdeaId = ideaId;
  const projects = await getAll("projects");
  const select = document.getElementById("taskProject");
  select.innerHTML = projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

  if (!projects.length) {
    alert("请先新建一个项目，再添加任务。");
    closeModal("taskFormModal");
    return;
  }

  if (projectId) select.value = String(projectId);
  document.getElementById("taskTitle").value = prefillTitle || "";
  document.getElementById("taskPriority").value = "中";
  document.getElementById("taskDeadline").value = "";
  document.getElementById("taskEstimate").value = "";
  document.getElementById("taskNextAction").value = "";
  document.getElementById("taskTags").value = "";
  document.getElementById("taskFormTitle").textContent = ideaId ? "转任务" : "新建任务";
  openModal("taskFormModal");
}

async function openTaskDetail(id) {
  const task = await getOne("tasks", id);
  if (!task) return;
  const project = task.projectId ? await getOne("projects", task.projectId) : null;

  document.getElementById("taskDetailContent").innerHTML = `
    <div class="card">
      <div class="card-title">${escapeHtml(task.title)} <span class="badge ${task.status === "done" ? "done" : ""}">${task.status === "done" ? "已完成" : "进行中"}</span></div>
      <div class="card-sub">
        项目：${project ? escapeHtml(project.name) : "未归属"}<br>
        优先级：${escapeHtml(task.priority || "中")}<br>
        截止：${fmtDate(task.deadline)}<br>
        预计耗时：${task.estimate ? task.estimate + " 分钟" : "未填"}<br>
        标签：${(task.tags || []).length ? escapeHtml((task.tags || []).join("、")) : "无"}<br>
        下一步：${escapeHtml(task.nextAction || "还没写下一步")}
      </div>
      <div class="row-buttons">
        ${task.status !== "done" ? `<button class="primary small" onclick="window.completeTask(${task.id})">标记完成</button>` : ""}
      </div>
      <p class="hint">拆解引导、打断重排会在下一阶段加入。</p >
    </div>
  `;
  openModal("taskDetailModal");
}

async function completeTask(id) {
  const task = await getOne("tasks", id);
  if (!task) return;
  task.status = "done";
  task.updatedAt = Date.now();
  await putOne("tasks", task);
  closeModal("taskDetailModal");
  await renderAll();
}

async function convertIdea(id) {
  const idea = await getOne("ideas", id);
  if (!idea) return;
  await openTaskForm(id, null, idea.text.slice(0, 30));
}

async function archiveIdea(id) {
  const idea = await getOne("ideas", id);
  if (!idea) return;
  idea.status = "archived";
  idea.updatedAt = Date.now();
  await putOne("ideas", idea);
  await renderInbox();
}

function setupTabs() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.onclick = async () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", s.id === `tab-${tab}`));
      const titles = { today: "今日", projects: "项目", inbox: "收件箱", review: "复盘", settings: "设置" };
      document.getElementById("pageTitle").textContent = titles[tab] || "工作台";
      if (tab === "today") await renderToday();
      if (tab === "projects") await renderProjects();
      if (tab === "inbox") await renderInbox();
      if (tab === "review") await renderReview();
      if (tab === "settings") await renderSettings();
    };
  });
}

function setupModals() {
  document.querySelectorAll(".close-modal").forEach((btn) => {
    btn.onclick = () => closeModal(btn.dataset.close);
  });
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });
}

function setupQuickForm() {
  document.getElementById("fab").onclick = () => {
    document.getElementById("quickText").value = "";
    openModal("quickModal");
    setTimeout(() => document.getElementById("quickText").focus(), 50);
  };

  document.getElementById("quickForm").onsubmit = async (e) => {
    e.preventDefault();
    const text = document.getElementById("quickText").value.trim();
    if (!text) return;
    await putOne("ideas", {
      type: "text",
      text,
      status: "未整理",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    closeModal("quickModal");
    await renderInbox();
    alert("已保存到收件箱。");
  };
}

function setupProjectForm() {
  document.getElementById("newProjectBtn").onclick = () => {
    document.getElementById("projectForm").reset();
    openModal("projectFormModal");
  };

  document.getElementById("projectForm").onsubmit = async (e) => {
    e.preventDefault();
    const project = {
      name: document.getElementById("projectName").value.trim(),
      domain: document.getElementById("projectDomain").value,
      goal: document.getElementById("projectGoal").value.trim(),
      deadline: document.getElementById("projectDeadline").value,
      nextAction: document.getElementById("projectNextAction").value.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (!project.name) return;
    await putOne("projects", project);
    closeModal("projectFormModal");
    await renderAll();
  };
}

function setupTaskForm() {
  document.getElementById("taskForm").onsubmit = async (e) => {
    e.preventDefault();
    const tags = document.getElementById("taskTags").value
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const task = {
      title: document.getElementById("taskTitle").value.trim(),
      projectId: Number(document.getElementById("taskProject").value),
      priority: document.getElementById("taskPriority").value,
      deadline: document.getElementById("taskDeadline").value,
      estimate: document.getElementById("taskEstimate").value ? Number(document.getElementById("taskEstimate").value) : null,
      nextAction: document.getElementById("taskNextAction").value.trim(),
      tags,
      status: "todo",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (!task.title) return;
    await putOne("tasks", task);

    if (currentIdeaId) {
      const idea = await getOne("ideas", currentIdeaId);
      if (idea) {
        idea.status = "已转任务";
        idea.updatedAt = Date.now();
        await putOne("ideas", idea);
      }
      currentIdeaId = null;
    }

    closeModal("taskFormModal");
    await renderAll();
  };
}

function setupDomainBar() {
  document.querySelectorAll("#domainBar .chip").forEach((btn) => {
    btn.onclick = async () => {
      currentDomain = btn.dataset.domain;
      await renderProjects();
    };
  });
}

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (err) {
      console.warn("Service worker 注册失败", err);
    }
  }
}

async function init() {
  await openDB();
  setupTabs();
  setupModals();
  setupQuickForm();
  setupProjectForm();
  setupTaskForm();
  setupDomainBar();
  await renderAll();
  registerSW();
}

window.openProjectDetail = openProjectDetail;
window.openTaskForm = openTaskForm;
window.openTaskDetail = openTaskDetail;
window.completeTask = completeTask;
window.convertIdea = convertIdea;
window.archiveIdea = archiveIdea;

init().catch((err) => {
  console.error(err);
  alert("启动失败：" + err.message);
});
```  