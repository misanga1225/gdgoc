import "../../shared/styles/tokens.css";
import "../../shared/styles/base.css";
import "./styles.css";
import "./styles/d01-login.css";
import "./styles/d02-session-hub.css";
import "./styles/doctor-main.css";
import { renderDoctorLoginPage } from "./pages/DoctorLoginPage";
import { renderDoctorMainPage } from "./pages/DoctorMainPage";
import { renderSessionHubPage } from "./pages/SessionHubPage";
import { addSessionId } from "./sessions";
import { renderUploadView } from "./upload";

const appRoot = document.getElementById("app");
if (!appRoot) {
  throw new Error("#app が見つかりません");
}
const app: HTMLElement = appRoot;
let loginUserId = "";

async function main(): Promise<void> {
  renderLogin();
}

function renderLogin(): void {
  const login = renderDoctorLoginPage({
    onLoginSuccess: ({ userId }) => {
      loginUserId = userId;
      void renderD02();
    },
  });

  app.className = "app-root app-root--login";
  app.innerHTML = "";
  app.append(login);
}

async function renderD02(): Promise<void> {
  app.className = "app-root app-root--d02";
  app.innerHTML = "";
  await renderSessionHubPage(app, {
    loginUserId,
    onOpenD05: ({ sessionId, name, chartId }) => {
      renderD05(sessionId, name, chartId);
    },
    onOpenD03: ({ initialName, initialPatientId }) => {
      renderD03(initialName, initialPatientId);
    },
  });
}

function renderD03(initialName: string, initialPatientId: string): void {
  app.className = "app-root app-root--d03";
  app.innerHTML = "";

  const wrapper = document.createElement("section");
  wrapper.className = "d03-page";

  const header = document.createElement("header");
  header.className = "d03-header";

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "btn btn-secondary btn-sm";
  backButton.textContent = "一覧画面へ戻る";
  backButton.addEventListener("click", () => {
    void renderD02();
  });

  const title = document.createElement("h2");
  title.className = "d03-title";
  title.textContent = "資料追加・URL発行";

  header.append(backButton, title);

  const content = document.createElement("div");
  content.className = "d03-content";

  wrapper.append(header, content);
  app.append(wrapper);

  renderUploadView(
    content,
    (sessionId) => {
      addSessionId(sessionId);
      void renderD02();
    },
    {
      heading: "資料追加",
      submitLabel: "アップロードしてURLを発行",
      initialName,
      initialPatientId,
    }
  );
}

function renderD05(
  _sessionId: string,
  patientName: string,
  patientChartId: string
): void {
  app.className = "app-root app-root--d05";
  app.innerHTML = "";

  const container = document.createElement("div");
  container.className = "d05-root";
  app.append(container);

  renderDoctorMainPage(container, {
    onBackToD02: () => {
      void renderD02();
    },
    patientName,
    patientChartId,
  });
}

void main();
