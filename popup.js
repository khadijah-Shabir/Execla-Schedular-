document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get([
    "apiKey","execName","execRole","replyMode",
    "earliestMeeting","latestMeeting","maxMeetings","buffer"
  ], (data) => {
    if (data.apiKey) document.getElementById("apiKey").value = data.apiKey;
    if (data.execName) document.getElementById("execName").value = data.execName;
    if (data.execRole) document.getElementById("execRole").value = data.execRole;
    if (data.replyMode) document.getElementById("replyMode").value = data.replyMode;
    if (data.earliestMeeting) document.getElementById("earliestMeeting").value = data.earliestMeeting;
    if (data.latestMeeting) document.getElementById("latestMeeting").value = data.latestMeeting;
    if (data.maxMeetings) document.getElementById("maxMeetings").value = data.maxMeetings;
    if (data.buffer) document.getElementById("buffer").value = data.buffer;
  });

  document.getElementById("saveBtn").addEventListener("click", () => {
    const settings = {
      apiKey: document.getElementById("apiKey").value.trim(),
      execName: document.getElementById("execName").value.trim(),
      execRole: document.getElementById("execRole").value.trim(),
      replyMode: document.getElementById("replyMode").value,
      earliestMeeting: document.getElementById("earliestMeeting").value,
      latestMeeting: document.getElementById("latestMeeting").value,
      maxMeetings: document.getElementById("maxMeetings").value,
      buffer: document.getElementById("buffer").value
    };

    chrome.storage.sync.set(settings, () => {
      const status = document.getElementById("status");
      status.style.display = "block";
      setTimeout(() => { status.style.display = "none"; }, 2000);
    });
  });
});
