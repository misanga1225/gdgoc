import { createButton } from "../../../shared/components/Button";

export interface DoctorLoginPageOptions {
  onLoginSuccess: (payload: { userId: string; password: string }) => void;
}

export function renderDoctorLoginPage(
  options: DoctorLoginPageOptions
): HTMLElement {
  const root = document.createElement("section");
  root.className = "d01-login-page";

  const card = document.createElement("div");
  card.className = "d01-login-card";

  const title = document.createElement("h2");
  title.className = "d01-login-title";
  title.textContent = "医師ログイン";

  const form = document.createElement("form");
  form.className = "d01-login-form";

  const userIdGroup = document.createElement("label");
  userIdGroup.className = "d01-login-field";
  userIdGroup.textContent = "ユーザーID";

  const userIdInput = document.createElement("input");
  userIdInput.className = "d01-login-input";
  userIdInput.type = "text";
  userIdInput.name = "userId";
  userIdInput.autocomplete = "username";
  userIdInput.required = true;

  const passwordGroup = document.createElement("label");
  passwordGroup.className = "d01-login-field";
  passwordGroup.textContent = "パスワード";

  const passwordInput = document.createElement("input");
  passwordInput.className = "d01-login-input";
  passwordInput.type = "password";
  passwordInput.name = "password";
  passwordInput.autocomplete = "current-password";
  passwordInput.required = true;

  const error = document.createElement("p");
  error.className = "d01-login-error";
  error.hidden = true;

  const submit = createButton({
    label: "ログイン",
    variant: "primary",
    block: true,
    type: "submit",
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const userId = userIdInput.value.trim();
    const password = passwordInput.value.trim();

    if (!userId || !password) {
      error.textContent = "ユーザーIDとパスワードを入力してください。";
      error.hidden = false;
      return;
    }

    error.hidden = true;
    options.onLoginSuccess({ userId, password });
  });

  userIdGroup.append(userIdInput);
  passwordGroup.append(passwordInput);
  form.append(userIdGroup, passwordGroup, error, submit);
  card.append(title, form);
  root.append(card);

  return root;
}
