import {
  Alert,
  Button,
  Checkbox,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import BackToDashboard from "../auth/BackToDashboard";
import "./users-admin.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
});
const pageSize = 20;
const statusOptions = [
  { label: "启用", value: "ACTIVE" },
  { label: "停用", value: "DISABLED" },
];

type UserStatus = "ACTIVE" | "DISABLED";
type UserRoleCode = "USER" | "RESOURCE_ADMIN" | "SYSTEM_ADMIN";
type UserRole = { id: number; code: string; name: string };
type User = {
  id: number;
  username: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  roles: UserRole[];
};
type UserPage = { items: User[]; total: number };
const roleOptions: {
  label: string;
  value: UserRoleCode;
  disabled?: boolean;
}[] = [
  { label: "普通用户", value: "USER", disabled: true },
  { label: "资源管理员", value: "RESOURCE_ADMIN" },
  { label: "系统管理员", value: "SYSTEM_ADMIN" },
];

function errorText(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
    if (error.response?.status === 401) return "登录状态已失效，请重新登录。";
    if (error.response?.status === 403) return "当前账号没有用户管理权限。";
  }
  return "请求失败，请确认 API 和数据库正在运行后重试。";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UsersAdminApp() {
  const token = sessionStorage.getItem("accessToken");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<UserStatus | undefined>();
  const [draftKeyword, setDraftKeyword] = useState("");
  const [draftStatus, setDraftStatus] = useState<UserStatus | undefined>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<UserRoleCode[]>(["USER"]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("请先登录后访问用户管理。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<UserPage>("/users/manage", {
        params: {
          page,
          pageSize,
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
          ...(status ? { status } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [keyword, page, status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(user: User, nextStatus: UserStatus) {
    if (!token) return;
    setBusyId(user.id);
    setError("");
    setSuccess("");
    try {
      await api.patch(
        `/users/manage/${user.id}/status`,
        { status: nextStatus },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId(null);
    }
  }

  function openRoleEditor(user: User) {
    setRoleTarget(user);
    setSelectedRoles(
      Array.from(
        new Set([
          "USER",
          ...user.roles.map((role) => role.code as UserRoleCode),
        ]),
      ),
    );
    setError("");
  }

  async function saveRoles() {
    if (!token || !roleTarget) return;
    setBusyId(roleTarget.id);
    setError("");
    setSuccess("");
    try {
      await api.patch(
        `/users/manage/${roleTarget.id}/roles`,
        { roles: selectedRoles },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSuccess(`已更新 ${roleTarget.username} 的角色。`);
      setRoleTarget(null);
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId(null);
    }
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKeyword(draftKeyword);
    setStatus(draftStatus);
    setPage(1);
  }

  const columns: TableProps<User>["columns"] = [
    {
      title: "用户",
      key: "user",
      render: (_, user) => (
        <div className="users-admin-primary-cell">
          <strong>{user.username}</strong>
          <span>#{user.id}</span>
        </div>
      ),
    },
    { title: "邮箱", dataIndex: "email", key: "email" },
    {
      title: "角色",
      key: "roles",
      render: (_, user) => (
        <Space size={[4, 4]} wrap>
          {user.roles.map((role) => (
            <Tag key={role.id}>{role.name}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: UserStatus) => (
        <Tag color={value === "ACTIVE" ? "green" : "default"}>
          {value === "ACTIVE" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => formatDate(value),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, user) => (
        <Space size="small" wrap>
          <Button size="small" onClick={() => openRoleEditor(user)}>
            调整角色
          </Button>
          {user.status === "ACTIVE" ? (
            <Popconfirm
              title="停用这个用户？"
              description="停用后该用户将无法登录。"
              okText="确认停用"
              cancelText="返回"
              onConfirm={() => void updateStatus(user, "DISABLED")}
            >
              <Button size="small" danger loading={busyId === user.id}>
                停用
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              loading={busyId === user.id}
              onClick={() => void updateStatus(user, "ACTIVE")}
            >
              启用
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <main className="users-admin-page">
      <header className="users-admin-header">
        <div>
          <Typography.Text className="users-admin-eyebrow">
            系统管理
          </Typography.Text>
          <Typography.Title level={1}>用户管理</Typography.Title>
        </div>
        <BackToDashboard />
      </header>

      {error && (
        <Alert
          className="users-admin-alert"
          type="error"
          showIcon
          message={error}
        />
      )}
      {success && (
        <Alert
          className="users-admin-alert"
          type="success"
          showIcon
          message={success}
        />
      )}

      <section className="users-list-section">
        <form className="users-filters" onSubmit={submitFilters}>
          <Input
            aria-label="搜索用户"
            placeholder="搜索用户名或邮箱"
            value={draftKeyword}
            onChange={(event) => setDraftKeyword(event.target.value)}
            maxLength={100}
          />
          <Select
            allowClear
            aria-label="用户状态"
            placeholder="全部状态"
            value={draftStatus}
            options={statusOptions}
            onChange={(value) =>
              setDraftStatus(value as UserStatus | undefined)
            }
          />
          <Button htmlType="submit" type="primary">
            筛选
          </Button>
          <Button onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
        </form>

        <Spin spinning={loading}>
          <Table<User>
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={false}
            locale={{ emptyText: "暂无用户" }}
            scroll={{ x: 860 }}
          />
        </Spin>
        <Pagination
          className="users-pagination"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger={false}
          hideOnSinglePage
          onChange={setPage}
        />
      </section>
      <Modal
        title={`调整 ${roleTarget?.username ?? ""} 的角色`}
        open={roleTarget !== null}
        okText="保存角色"
        cancelText="取消"
        confirmLoading={roleTarget !== null && busyId === roleTarget.id}
        onOk={() => void saveRoles()}
        onCancel={() => setRoleTarget(null)}
      >
        <Checkbox.Group
          className="users-role-options"
          options={roleOptions}
          value={selectedRoles}
          onChange={(values) => setSelectedRoles(values as UserRoleCode[])}
        />
        <Typography.Paragraph type="secondary">
          普通用户角色固定保留。角色权限会在用户重新登录或刷新令牌后生效。
        </Typography.Paragraph>
      </Modal>
    </main>
  );
}
