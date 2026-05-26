// ============================================
// EXECLA — Content Script (Gmail & Outlook)
// ============================================

(function () {
  if (document.getElementById("execla-sidebar-root")) return;

  let currentEmailText = "";
  let currentSubject = "";
  let currentSender = "";
  let settings = {};
  let activeTab = "schedule";

  // --- Load settings ---
  chrome.storage.sync.get(null, (data) => {
    settings = data;
    if (!settings.apiKey) {
      console.log("[Execla] No API key set. Click the extension icon to configure.");
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
      settings[key] = changes[key].newValue;
    }
  });

  // --- Create sidebar ---
  const sidebar = document.createElement("div");
  sidebar.id = "execla-sidebar-root";
  sidebar.innerHTML = buildSidebarHTML();
  document.body.appendChild(sidebar);

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "execla-toggle-btn";
  toggleBtn.textContent = "E";
  toggleBtn.title = "Toggle Execla sidebar";
  document.body.appendChild(toggleBtn);

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("hidden");
    toggleBtn.classList.toggle("collapsed");
  });

  document.querySelector(".execla-close-btn").addEventListener("click", () => {
    sidebar.classList.add("hidden");
    toggleBtn.classList.add("collapsed");
  });

  // --- Tab switching ---
  document.querySelectorAll(".execla-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll(".execla-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderActiveTab();
    });
  });

  // --- Email detection loop ---
  setInterval(() => {
    const emailData = extractEmailContent();
    if (emailData && emailData.body !== currentEmailText) {
      currentEmailText = emailData.body;
      currentSubject = emailData.subject;
      currentSender = emailData.sender;
      renderActiveTab();
    }
  }, 2000);

  // --- Extract email content from Gmail or Outlook ---
  function extractEmailContent() {
    const isGmail = window.location.hostname === "mail.google.com";
    const isOutlook = window.location.hostname.includes("outlook");

    if (isGmail) {
      const msgEls = document.querySelectorAll('div[data-message-id] .a3s');
      if (msgEls.length === 0) return null;
      const body = Array.from(msgEls).map((el) => el.innerText).join("\n\n---\n\n");
      const subjectEl = document.querySelector('h2[data-thread-perm-id]') || document.querySelector('.hP');
      const subject = subjectEl ? subjectEl.innerText : "";
      const senderEl = document.querySelector('.gD');
      const sender = senderEl ? (senderEl.getAttribute('email') || senderEl.innerText) : "";
      return { body, subject, sender };
    }

    if (isOutlook) {
      const readingPane = document.querySelector('[role="main"] [aria-label*="Message body"]') ||
                          document.querySelector('.wide-content-host') ||
                          document.querySelector('[aria-label="Reading Pane"]');
      if (!readingPane) return null;
      const body = readingPane.innerText;
      const subjectEl = document.querySelector('[role="main"] [aria-label*="subject"]') ||
                        document.querySelector('.allowTextSelection');
      const subject = subjectEl ? subjectEl.innerText : "";
      return { body, subject, sender: "" };
    }

    return null;
  }

  // --- Render active tab ---
  function renderActiveTab() {
    const content = document.querySelector(".execla-content");
    if (!currentEmailText) {
      content.innerHTML = `
        <div class="execla-empty-state">
          <div class="execla-status-icon empty">📩</div>
          <div class="execla-status-title">Open an email</div>
          <div class="execla-status-desc">Click on any email in your inbox and Execla will analyze it.</div>
        </div>`;
      return;
    }

    if (!settings.apiKey) {
      content.innerHTML = `
        <div class="execla-settings-notice">
          ⚙️ Please click the Execla icon in your toolbar and add your Claude API key to get started.
        </div>`;
      return;
    }

    if (activeTab === "schedule") renderScheduleTab(content);
    else renderWriteTab(content);
  }

  // --- SCHEDULE TAB ---
  function renderScheduleTab(content) {
    content.innerHTML = `
      <div class="execla-loading">
        <div class="execla-spinner"></div>
        <div class="execla-loading-text">Analyzing email for scheduling intent...</div>
      </div>`;

    const prompt = `You are an executive assistant AI. Analyze this email and determine if it contains a scheduling/meeting request.

EMAIL SUBJECT: ${currentSubject}
EMAIL FROM: ${currentSender}

EMAIL BODY:
${currentEmailText.substring(0, 3000)}

Respond ONLY with a JSON object (no markdown, no backticks):
{
  "isSchedulingRequest": true/false,
  "meetingType": "type",
  "durationMinutes": number,
  "participants": ["names"],
  "constraints": "time preferences mentioned",
  "urgency": "when they want to meet"
}`;

    callClaude(prompt, (response) => {
      try {
        const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const analysis = JSON.parse(cleaned);

        if (!analysis.isSchedulingRequest) {
          content.innerHTML = `
            <div class="execla-status">
              <div class="execla-status-icon empty">📧</div>
              <div class="execla-status-title">No scheduling request</div>
              <div class="execla-status-desc">This email doesn't appear to contain a meeting or scheduling request. Switch to the "Write" tab to draft a reply.</div>
            </div>`;
          return;
        }

        const slots = generateMockSlots(analysis.durationMinutes || 30);

        content.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;">
            <div class="execla-pulse"></div>
            <span style="font-size:13px;font-weight:500;color:#534AB7;">Scheduling request detected</span>
          </div>

          <div class="execla-section-label">Request details</div>
          <div class="execla-card">
            <div class="execla-info-grid">
              <span class="execla-info-label">Type</span>
              <span class="execla-info-value">${analysis.meetingType || "Meeting"}</span>
              <span class="execla-info-label">Duration</span>
              <span class="execla-info-value">${analysis.durationMinutes || 30} min</span>
              <span class="execla-info-label">When</span>
              <span class="execla-info-value">${analysis.urgency || "TBD"}</span>
              <span class="execla-info-label">Who</span>
              <span class="execla-info-value">${(analysis.participants || []).join(", ")}</span>
              <span class="execla-info-label">Notes</span>
              <span class="execla-info-value">${analysis.constraints || "None"}</span>
            </div>
          </div>

          <div class="execla-section-label">Available times</div>
          <div id="execla-slots">
            ${slots.map((s, i) => `
              <div class="execla-slot" data-idx="${i}" onclick="this.classList.toggle('selected')">
                <div>
                  <div class="execla-slot-day">${s.day}</div>
                  <div class="execla-slot-time">${s.time}</div>
                </div>
                <div class="execla-slot-check">✓</div>
              </div>
            `).join("")}
          </div>

          <button class="execla-btn primary" id="execla-propose-btn" style="margin-top:12px;">
            ✉ Draft scheduling reply
          </button>
        `;

        document.getElementById("execla-propose-btn").addEventListener("click", () => {
          const selectedSlots = Array.from(document.querySelectorAll(".execla-slot.selected"));
          if (selectedSlots.length === 0) {
            alert("Please select at least one time slot.");
            return;
          }

          const selectedTimes = selectedSlots.map((el) => {
            return el.querySelector(".execla-slot-day").textContent + " at " +
                   el.querySelector(".execla-slot-time").textContent;
          });

          draftSchedulingReply(analysis, selectedTimes, content);
        });

      } catch (e) {
        content.innerHTML = `
          <div class="execla-status">
            <div class="execla-status-icon empty">⚠️</div>
            <div class="execla-status-title">Analysis failed</div>
            <div class="execla-status-desc">Could not parse the email. Try refreshing or opening a different email.</div>
          </div>`;
      }
    });
  }

  function draftSchedulingReply(analysis, selectedTimes, content) {
    content.innerHTML = `
      <div class="execla-loading">
        <div class="execla-spinner"></div>
        <div class="execla-loading-text">Drafting scheduling response...</div>
      </div>`;

    const execName = settings.execName || "the executive";
    const execRole = settings.execRole || "";
    const slotsText = selectedTimes.map((t, i) => `${i + 1}. ${t}`).join("\n");

    const prompt = `You are the executive assistant for ${execName}${execRole ? " (" + execRole + ")" : ""}. 
Write a brief, warm, professional email reply proposing meeting times.

Replying to: ${currentSender}
Meeting type: ${analysis.meetingType}
Duration: ${analysis.durationMinutes} minutes

AVAILABLE TIME SLOTS:
${slotsText}

Keep it short (4-6 sentences). List ALL time slots. Ask them to confirm which works. Sign as "${execName}'s Office". Write ONLY the email body.`;

    callClaude(prompt, (reply) => {
      content.innerHTML = `
        <div class="execla-section-label">Draft reply</div>
        <div class="execla-draft" id="execla-draft-text">${reply}</div>

        <div class="execla-action-row">
          <button class="execla-btn secondary" id="execla-edit-draft">✏️ Edit</button>
          <button class="execla-btn primary" id="execla-use-draft">📋 Copy to clipboard</button>
        </div>

        <button class="execla-btn success" id="execla-insert-draft" style="margin-top:8px;">
          ✉ Insert into reply
        </button>

        <div class="execla-sep"></div>

        <div class="execla-section-label">Adjust reply</div>
        <div class="execla-tone-row">
          <button class="execla-tone-btn" data-action="shorter">Shorter</button>
          <button class="execla-tone-btn" data-action="more formal">More formal</button>
          <button class="execla-tone-btn" data-action="more friendly">Friendlier</button>
          <button class="execla-tone-btn" data-action="add urgency">Add urgency</button>
        </div>
      `;

      setupDraftActions(reply);
    });
  }

  // --- WRITE TAB ---
  function renderWriteTab(content) {
    content.innerHTML = `
      <div class="execla-section-label">AI email writer</div>
      <div class="execla-card" style="margin-bottom:14px;">
        <div style="font-size:12px;color:#888780;margin-bottom:6px;">Replying to: <strong style="font-weight:500;color:#2C2C2A;">${currentSubject || "this email"}</strong></div>
      </div>

      <div class="execla-section-label">What do you want to say?</div>
      <textarea class="execla-textarea" id="execla-write-prompt" placeholder="e.g., Thank them and confirm we'll send the report by Friday..."></textarea>

      <div class="execla-section-label" style="margin-top:14px;">Tone</div>
      <div class="execla-tone-row" id="execla-tone-select">
        <button class="execla-tone-btn active" data-tone="professional">Professional</button>
        <button class="execla-tone-btn" data-tone="friendly">Friendly</button>
        <button class="execla-tone-btn" data-tone="brief">Brief</button>
        <button class="execla-tone-btn" data-tone="formal">Formal</button>
        <button class="execla-tone-btn" data-tone="apologetic">Apologetic</button>
      </div>

      <button class="execla-btn primary" id="execla-generate-btn">
        ✨ Generate reply
      </button>

      <div id="execla-write-result"></div>
    `;

    document.querySelectorAll("#execla-tone-select .execla-tone-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#execla-tone-select .execla-tone-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    document.getElementById("execla-generate-btn").addEventListener("click", () => {
      const userPrompt = document.getElementById("execla-write-prompt").value.trim();
      const tone = document.querySelector("#execla-tone-select .execla-tone-btn.active")?.dataset.tone || "professional";
      const resultDiv = document.getElementById("execla-write-result");

      if (!userPrompt) {
        resultDiv.innerHTML = `<div class="execla-settings-notice">Please describe what you want to say.</div>`;
        return;
      }

      resultDiv.innerHTML = `
        <div class="execla-loading" style="padding:20px;">
          <div class="execla-spinner"></div>
          <div class="execla-loading-text">Writing your reply...</div>
        </div>`;

      const execName = settings.execName || "the sender";
      const prompt = `You are writing an email reply on behalf of ${execName}.

ORIGINAL EMAIL SUBJECT: ${currentSubject}
ORIGINAL EMAIL:
${currentEmailText.substring(0, 2000)}

THE USER WANTS TO SAY: ${userPrompt}
TONE: ${tone}

Write ONLY the email body. Keep it concise and natural. Do not include subject line or greetings like "Subject:" or "Re:".`;

      callClaude(prompt, (reply) => {
        resultDiv.innerHTML = `
          <div class="execla-sep"></div>
          <div class="execla-section-label">Generated reply</div>
          <div class="execla-draft" id="execla-draft-text">${reply}</div>

          <div class="execla-action-row">
            <button class="execla-btn secondary" id="execla-edit-draft">✏️ Edit</button>
            <button class="execla-btn primary" id="execla-use-draft">📋 Copy</button>
          </div>

          <button class="execla-btn success" id="execla-insert-draft" style="margin-top:8px;">
            ✉ Insert into reply
          </button>

          <div class="execla-sep"></div>
          <div class="execla-section-label">Rewrite</div>
          <div class="execla-tone-row">
            <button class="execla-tone-btn" data-action="shorter">Shorter</button>
            <button class="execla-tone-btn" data-action="longer and more detailed">Longer</button>
            <button class="execla-tone-btn" data-action="more formal">More formal</button>
            <button class="execla-tone-btn" data-action="more friendly and warm">Friendlier</button>
            <button class="execla-tone-btn" data-action="more direct and assertive">More direct</button>
          </div>
        `;

        setupDraftActions(reply);
      });
    });
  }

  // --- Shared: draft action buttons ---
  function setupDraftActions(currentDraft) {
    const editBtn = document.getElementById("execla-edit-draft");
    const copyBtn = document.getElementById("execla-use-draft");
    const insertBtn = document.getElementById("execla-insert-draft");
    const draftEl = document.getElementById("execla-draft-text");

    if (editBtn) {
      editBtn.addEventListener("click", () => {
        const text = draftEl.innerText;
        draftEl.outerHTML = `<textarea class="execla-textarea" id="execla-draft-text" style="min-height:140px;">${text}</textarea>`;
        editBtn.textContent = "✓ Done";
        editBtn.onclick = () => {
          const edited = document.getElementById("execla-draft-text").value;
          document.getElementById("execla-draft-text").outerHTML = `<div class="execla-draft" id="execla-draft-text">${edited}</div>`;
          editBtn.textContent = "✏️ Edit";
          setupDraftActions(edited);
        };
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = draftEl.innerText || draftEl.value;
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "✓ Copied!";
          setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 2000);
        });
      });
    }

    if (insertBtn) {
      insertBtn.addEventListener("click", () => {
        const text = draftEl.innerText || draftEl.value;
        insertIntoCompose(text);
        insertBtn.textContent = "✓ Inserted!";
        setTimeout(() => { insertBtn.textContent = "✉ Insert into reply"; }, 2000);
      });
    }

    document.querySelectorAll(".execla-tone-btn[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const text = draftEl.innerText || draftEl.value;
        const parentContainer = draftEl.closest(".execla-content") || document.querySelector(".execla-content");

        btn.textContent = "...";
        btn.disabled = true;

        const prompt = `Rewrite this email to be ${action}. Return ONLY the rewritten email body, nothing else:\n\n${text}`;
        callClaude(prompt, (rewritten) => {
          draftEl.innerHTML = rewritten;
          btn.textContent = action.charAt(0).toUpperCase() + action.slice(1);
          btn.disabled = false;
          setupDraftActions(rewritten);
        });
      });
    });
  }

  // --- Insert text into Gmail/Outlook compose box ---
  function insertIntoCompose(text) {
    const isGmail = window.location.hostname === "mail.google.com";

    if (isGmail) {
      // Click reply button if compose box isn't open
      const replyBtn = document.querySelector('[data-tooltip="Reply"]') ||
                       document.querySelector('.ams.bkH');
      if (replyBtn) replyBtn.click();

      setTimeout(() => {
        const composeBox = document.querySelector('div[role="textbox"][aria-label*="Message Body"]') ||
                           document.querySelector('div.Am.aiL div[contenteditable="true"]') ||
                           document.querySelector('div[aria-label="Message Body"]') ||
                           document.querySelector('.editable[contenteditable="true"]');
        if (composeBox) {
          composeBox.focus();
          composeBox.innerHTML = text.replace(/\n/g, "<br>");
        } else {
          navigator.clipboard.writeText(text);
          alert("Compose box not found. The reply has been copied to your clipboard — paste it with Ctrl+V.");
        }
      }, 800);
    } else {
      // Outlook web
      const composeBox = document.querySelector('div[role="textbox"]') ||
                         document.querySelector('[aria-label*="Message body"]');
      if (composeBox) {
        composeBox.focus();
        composeBox.innerHTML = text.replace(/\n/g, "<br>");
      } else {
        navigator.clipboard.writeText(text);
        alert("Compose box not found. The reply has been copied to your clipboard — paste it with Ctrl+V.");
      }
    }
  }

  // --- Generate mock available time slots ---
  function generateMockSlots(durationMinutes) {
    const slots = [];
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const earliest = parseInt(settings.earliestMeeting?.split(":")[0]) || 10;
    const latest = parseInt(settings.latestMeeting?.split(":")[0]) || 17;

    const now = new Date();
    for (let d = 1; d <= 10 && slots.length < 5; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;

      const hour = earliest + Math.floor(Math.random() * (latest - earliest - 1));
      const minute = Math.random() > 0.5 ? 30 : 0;
      const startH = hour % 12 || 12;
      const startAmPm = hour >= 12 ? "PM" : "AM";
      const endDate = new Date(date);
      endDate.setHours(hour, minute + durationMinutes);
      const endH = endDate.getHours() % 12 || 12;
      const endAmPm = endDate.getHours() >= 12 ? "PM" : "AM";
      const endMin = endDate.getMinutes();

      slots.push({
        day: `${days[dow - 1]}, ${months[date.getMonth()]} ${date.getDate()}`,
        time: `${startH}:${minute === 0 ? "00" : "30"} ${startAmPm} – ${endH}:${endMin === 0 ? "00" : "30"} ${endAmPm}`
      });
    }

    return slots;
  }

  // --- Call Claude via background script ---
  function callClaude(prompt, callback) {
    chrome.runtime.sendMessage(
      { action: "callClaude", prompt: prompt, apiKey: settings.apiKey },
      (response) => {
        if (response && response.success) {
          callback(response.data);
        } else {
          const errMsg = response?.error || "Failed to reach Claude API";
          callback(`Error: ${errMsg}. Please check your API key in settings.`);
        }
      }
    );
  }

  // --- Build sidebar HTML ---
  function buildSidebarHTML() {
    return `
      <div class="execla-header">
        <div class="execla-logo">
          <div class="execla-logo-icon">E</div>
          <span class="execla-logo-text">Execla</span>
          <span class="execla-badge purple">AI</span>
        </div>
        <button class="execla-close-btn">✕</button>
      </div>

      <div class="execla-tabs">
        <button class="execla-tab active" data-tab="schedule">
          <span class="execla-tab-icon">📅</span> Schedule
        </button>
        <button class="execla-tab" data-tab="write">
          <span class="execla-tab-icon">✍️</span> Write
        </button>
      </div>

      <div class="execla-content">
        <div class="execla-empty-state">
          <div class="execla-status-icon empty">📩</div>
          <div class="execla-status-title">Open an email</div>
          <div class="execla-status-desc">Click on any email and Execla will analyze it.</div>
        </div>
      </div>
    `;
  }
})();
