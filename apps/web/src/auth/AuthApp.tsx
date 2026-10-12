import axios from "axios";
import { useState } from "react";
import type { FormEvent } from "react";
import "./auth.css";

const api = axios.create({
  baseURL: "http://localhost:3000/api/v1",
  withCredentials: true,
});
type Mode = "login" | "register";
type User = {
  id: number;
  username: string;
  email: string;
  status: string;
  roles?: { code: string; name: string }[];
};
type AuthResponse = { accessToken?: string; user: User };

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
  }
  return "请求失败，请确认 API 正在运行后重试";
}

export default function AuthApp() {
  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const registerMode = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (registerMode) {
        await api.post("/auth/register", {
          username: identifier,
          email,
          password,
        });
        setMode("login");
        setMessage("注册成功，请使用账号登录");
      } else {
        const { data } = await api.post<AuthResponse>("/auth/login", {
          identifier,
          password,
        });
        if (data.accessToken)
          sessionStorage.setItem("accessToken", data.accessToken);
        setUser(data.user);
        setMessage("登录成功");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
    setUser(null);
  }

  async function logout() {
    setLoading(true);
    setMessage("");
    try {
      await api.post("/auth/logout");
      sessionStorage.removeItem("accessToken");
      setUser(null);
      setMessage("已退出登录");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  if (user) {
    return (
      <main className="auth-page">
        <section className="auth-card signed-in">
          <p className="auth-eyebrow">SIGNED IN</p>
          <h1>欢迎回来，{user.username}</h1>
          <dl>
            <div>
              <dt>邮箱</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{user.status}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>
                {user.roles?.map((role) => role.name).join("、") || "普通用户"}
              </dd>
            </div>
          </dl>
          <button
            className="secondary-button"
            type="button"
            disabled={loading}
            onClick={() => void logout()}
          >
            {loading ? "处理中..." : "退出当前会话"}
          </button>
          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="auth-eyebrow">BOOKING RESOURCE SCHEDULER</p>
          <h1>可配置预约与资源排期系统</h1>
          <p>登录后查看资源与可预约时间。</p>
        </div>
        <div className="auth-tabs" role="tablist">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            type="button"
            onClick={() => switchMode("register")}
          >
            注册
          </button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="identifier">
            {registerMode ? "用户名" : "用户名或邮箱"}
          </label>
          <input
            id="identifier"
            required
            minLength={registerMode ? 3 : 1}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={registerMode ? "例如 honey_demo" : "输入用户名或邮箱"}
          />
          {registerMode && (
            <>
              <label htmlFor="email">邮箱</label>
              <input
                id="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </>
          )}
          <label htmlFor="password">密码</label>
          <input
            id="password"
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位字符"
          />
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "处理中..." : registerMode ? "创建账号" : "登录"}
          </button>
        </form>
        {message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
