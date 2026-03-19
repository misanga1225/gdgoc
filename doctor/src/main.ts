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
import { buildPatientFullUrl } from "./api";
import { showPatientUrlDialog } from "./components/session-hub/PatientUrlDialog";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

const appRoot = document.getElementById("app");
if (!appRoot) {
  throw new Error("#app が見つかりません");
}
const app: HTMLElement = appRoot;
let loginUserId = "";

async function main(): Promise<void> {
  // 開発環境ではログインをスキップ（ログイン機能テストのため一時無効化）
  // if (import.meta.env.DEV) {
  //   await renderD02();
  //   return;
  // }
  // 本番: Firebase Authのログイン状態を監視
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginUserId = user.uid;
      void renderD02();
    } else {
      renderLogin();
    }
  });
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

interface D02RenderOptions {
  preselectedGroupKey?: string | null;
}

async function renderD02(options?: D02RenderOptions): Promise<void> {
  app.className = "app-root app-root--d02";
  app.innerHTML = "";

  await renderSessionHubPage(app, {
    loginUserId,
    initialSelectedGroupKey: options?.preselectedGroupKey ?? null,
    onLogout: () => void signOut(auth),
    onOpenD05: ({
      sessionId,
      name,
      chartId,
      selectedFileId,
      selectedFileName,
    }) => {
      renderD05(sessionId, name, chartId, selectedFileId, selectedFileName);
    },
    onOpenD03: ({
      initialName,
      initialPatientId,
      selectedSessionId,
      selectedFileId,
    }) => {
      renderD03(
        initialName,
        initialPatientId,
        selectedSessionId,
        selectedFileId
      );
    },
  });
}

function renderD03(
  initialName: string,
  initialPatientId: string,
  _selectedSessionId: string | null,
  _selectedFileId: string | null
): void {
  // グループキーを計算（戻り時に同じ患者を選択するため）
  const groupKey = initialName && initialPatientId
    ? `${initialName}|${initialPatientId}`
    : null;

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
    void renderD02({
      preselectedGroupKey: groupKey,
    });
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
    (sessionId, patientUrl) => {
      addSessionId(sessionId);
      // アップロード後のgroupKeyは入力値から算出
      const newGroupKey = `${initialName}|${initialPatientId}`;
      if (patientUrl) {
        showPatientUrlDialog(buildPatientFullUrl(patientUrl), () => {
          void renderD02({
            preselectedGroupKey: newGroupKey || null,
          });
        });
      } else {
        void renderD02({
          preselectedGroupKey: newGroupKey || null,
        });
      }
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
  sessionId: string,
  patientName: string,
  patientChartId: string,
  selectedFileId?: string | null,
  selectedFileName?: string
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
    sessionId,
    patientName,
    patientChartId,
    selectedFileId,
    selectedFileName,
  });
}

void main();
