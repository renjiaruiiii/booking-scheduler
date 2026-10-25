import { Alert, Button, Card, Form, Input, Typography } from "antd";
import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import "./auth.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  withCredentials: true,
});

type Mode = "login" | "register";
export type User = {
  id: number;
  username: string;
  email: string;
  status: string;
  roles?: { code: string; name: string }[];
};
type AuthResponse = { accessToken?: string; user: User };
type FormValues = {
  identifier?: string;
  username?: string;
  email?: string;
  password: string;
};

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
  }
  return "请求失败，请确认 API 正在运行后重试";
}

function internalPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;
}

const userStorageKey = "authUser";

function readStoredUser() {
  const raw = sessionStorage.getItem(userStorageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    sessionStorage.removeItem(userStorageKey);
    return null;
  }
}

function saveUser(user: User) {
  sessionStorage.setItem(userStorageKey, JSON.stringify(user));
}

export default function AuthApp() {
  const [form] = Form.useForm<FormValues>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );
  const [user, setUser] = useState<User | null>(null);
  const nextPath = internalPath(searchParams.get("next"));
  const registerMode = mode === "register";

  useEffect(() => {
    form.resetFields();
  }, [form, mode]);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");
    const storedUser = token ? readStoredUser() : null;
    if (storedUser) {
      setUser(storedUser);
      if (nextPath) navigate(nextPath, { replace: true });
      setRestoring(false);
      return;
    }
    if (!token) {
      setRestoring(false);
      return;
    }

    api
      .get<{ user: { sub: number; username: string; roles: string[] } }>(
        "/auth/me",
        { headers: { Authorization: `Bearer ${token}` } },
      )
      .then(({ data }) => {
        const roles = data.user.roles.map((code) => ({
          code,
          name:
            code === "SYSTEM_ADMIN"
              ? "系统管理员"
              : code === "RESOURCE_ADMIN"
                ? "资源管理员"
                : "普通用户",
        }));
        const restoredUser: User = {
          id: data.user.sub,
          username: data.user.username,
          email: "",
          status: "ACTIVE",
          roles,
        };
        saveUser(restoredUser);
        setUser(restoredUser);
        if (nextPath) navigate(nextPath, { replace: true });
      })
      .catch(() => {
        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem(userStorageKey);
      })
      .finally(() => setRestoring(false));
  }, [navigate, nextPath]);

  async function submit(values: FormValues) {
    setLoading(true);
    setMessage("");
    try {
      if (registerMode) {
        await api.post("/auth/register", {
          username: values.username,
          email: values.email,
          password: values.password,
        });
        setMode("login");
        setMessageType("success");
        setMessage("注册成功，请使用用户名或邮箱登录");
      } else {
        const { data } = await api.post<AuthResponse>("/auth/login", {
          identifier: values.identifier,
          password: values.password,
        });
        if (data.accessToken) {
          sessionStorage.setItem("accessToken", data.accessToken);
        }
        saveUser(data.user);
        if (nextPath) {
          navigate(nextPath, { replace: true });
          return;
        }
        setUser(data.user);
      }
    } catch (error) {
      setMessageType("error");
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
  }

  async function logout() {
    setLoading(true);
    setMessage("");
    try {
      await api.post("/auth/logout");
      sessionStorage.removeItem("accessToken");
      sessionStorage.removeItem(userStorageKey);
      setUser(null);
      navigate("/auth", { replace: true });
    } catch (error) {
      setMessageType("error");
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  if (restoring) return <main className="auth-page" aria-busy="true" />;

  if (user) {
    return (
      <DashboardLayout
        user={user}
        loading={loading}
        message={message}
        messageType={messageType}
        onLogout={() => void logout()}
      />
    );
  }

  return (
    <main className="auth-page">
      <Card className="auth-card" bordered={false}>
        <div className="auth-heading">
          <Typography.Text className="auth-eyebrow">
            BOOKING RESOURCE SCHEDULER
          </Typography.Text>
          <Typography.Title level={1}>
            {registerMode ? "创建预约账号" : "欢迎回来"}
          </Typography.Title>
          <Typography.Paragraph>
            {registerMode
              ? "注册后即可查看资源与可预约时间。"
              : "登录后查看资源与可预约时间。"}
          </Typography.Paragraph>
        </div>

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void submit(values)}
        >
          {registerMode ? (
            <>
              <Form.Item
                label="用户名"
                name="username"
                rules={[{ required: true, message: "请输入用户名" }]}
              >
                <Input size="large" placeholder="例如 honey_demo" />
              </Form.Item>
              <Form.Item
                label="邮箱"
                name="email"
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "请输入有效的邮箱地址" },
                ]}
              >
                <Input size="large" placeholder="name@example.com" />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              label="用户名或邮箱"
              name="identifier"
              rules={[{ required: true, message: "请输入用户名或邮箱" }]}
            >
              <Input size="large" placeholder="输入用户名或邮箱" />
            </Form.Item>
          )}
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少 8 位" },
            ]}
          >
            <Input.Password size="large" placeholder="至少 8 位字符" />
          </Form.Item>
          <Button
            className="primary-button"
            block
            htmlType="submit"
            loading={loading}
            size="large"
            type="primary"
          >
            {registerMode ? "注册" : "登录"}
          </Button>
        </Form>

        <div className="auth-switch">
          <Typography.Text>
            {registerMode ? "已经有账号了？" : "还没有账号？"}
          </Typography.Text>{" "}
          <Typography.Link
            onClick={() => switchMode(registerMode ? "login" : "register")}
          >
            {registerMode ? "返回登录" : "立即注册"}
          </Typography.Link>
        </div>
        {message && (
          <Alert
            className="auth-message"
            type={messageType}
            message={message}
          />
        )}
      </Card>
    </main>
  );
}
