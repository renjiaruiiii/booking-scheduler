import {
  AppstoreAddOutlined,
  CalendarOutlined,
  EditOutlined,
  FileTextOutlined,
  LayoutOutlined,
  LogoutOutlined,
  MailOutlined,
  ScheduleOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "./AuthApp";
import "./dashboard.css";

type DashboardLayoutProps = {
  user: User;
  loading: boolean;
  message?: string;
  messageType?: "success" | "error";
  onLogout: () => void;
};

const roleNames: Record<string, string> = {
  USER: "普通用户",
  RESOURCE_ADMIN: "资源管理员",
  SYSTEM_ADMIN: "系统管理员",
};

function primaryRole(user: User) {
  const codes = new Set((user.roles ?? []).map((role) => role.code));
  if (codes.has("SYSTEM_ADMIN")) return "SYSTEM_ADMIN";
  if (codes.has("RESOURCE_ADMIN")) return "RESOURCE_ADMIN";
  return "USER";
}

function menuItems(role: string): MenuProps["items"] {
  const personalItems: NonNullable<MenuProps["items"]> = [
    {
      key: "/resources",
      icon: <CalendarOutlined />,
      label: "浏览资源与可预约时间",
    },
    {
      key: "/bookings",
      icon: <ScheduleOutlined />,
      label: "查看我的预约",
    },
  ];

  if (role === "USER") {
    return [
      {
        type: "group",
        label: "个人预约",
        children: personalItems,
      },
    ];
  }

  const systemItems: NonNullable<MenuProps["items"]> = [];
  if (role === "RESOURCE_ADMIN" || role === "SYSTEM_ADMIN") {
    systemItems.push(
      {
        key: "/admin/resources",
        icon: <AppstoreAddOutlined />,
        label: "管理资源",
      },
      {
        key: "/admin/bookings",
        icon: <EditOutlined />,
        label: "管理预约",
      },
    );
  }

  if (role === "SYSTEM_ADMIN") {
    systemItems.push(
      {
        key: "/admin/users",
        icon: <UserOutlined />,
        label: "管理用户",
      },
      {
        key: "/admin/operation-logs",
        icon: <FileTextOutlined />,
        label: "查看操作日志",
      },
      {
        key: "/admin/outbox",
        icon: <MailOutlined />,
        label: "查看 Outbox 事件",
      },
    );
  }

  return [
    {
      type: "group",
      label: "系统管理",
      children: systemItems,
    },
    {
      type: "group",
      label: "个人预约",
      children: personalItems,
    },
  ];
}

function menuPaths(role: string) {
  const paths = ["/resources", "/bookings"];
  if (role === "RESOURCE_ADMIN" || role === "SYSTEM_ADMIN") {
    paths.unshift("/admin/resources", "/admin/bookings");
  }
  if (role === "SYSTEM_ADMIN") {
    paths.unshift("/admin/users", "/admin/operation-logs", "/admin/outbox");
  }
  return paths;
}

export default function DashboardLayout({
  user,
  loading,
  message,
  messageType = "success",
  onLogout,
}: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const role = primaryRole(user);
  const displayRole = roleNames[role];
  const items = menuItems(role);
  const paths = menuPaths(role);

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
  };

  return (
    <Layout className="dashboard-layout">
      <Layout.Sider
        breakpoint="lg"
        className="dashboard-sider"
        collapsed={collapsed}
        collapsedWidth={64}
        onCollapse={setCollapsed}
        theme="light"
        width={248}
      >
        <button
          className="dashboard-brand"
          type="button"
          onClick={() => navigate("/auth")}
        >
          <span className="dashboard-brand-mark">
            <LayoutOutlined />
          </span>
          {!collapsed && (
            <span>
              <strong>排期系统</strong>
              <small>资源预约工作台</small>
            </span>
          )}
        </button>
        <Menu
          items={items}
          mode="inline"
          selectedKeys={
            paths.includes(location.pathname) ? [location.pathname] : []
          }
          onClick={onMenuClick}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="dashboard-header">
          <div className="dashboard-header-title">可配置预约与资源排期系统</div>
          <Space className="dashboard-header-account" size={12}>
            <Avatar>{user.username.slice(0, 1).toUpperCase()}</Avatar>
            <div className="dashboard-account-copy">
              <strong>{user.username}</strong>
              <Tag color="blue">{displayRole}</Tag>
            </div>
            <Button
              icon={<LogoutOutlined />}
              loading={loading}
              onClick={onLogout}
            >
              退出登录
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="dashboard-content">
          {message && (
            <Alert
              className="dashboard-alert"
              message={message}
              type={messageType}
              showIcon
            />
          )}
          <div className="dashboard-welcome">
            <div>
              <Typography.Title level={1}>
                欢迎回来，{user.username}
              </Typography.Title>
              <Typography.Paragraph>
                从左侧菜单进入资源、预约和管理功能。
              </Typography.Paragraph>
            </div>
            <Tag color="green">
              账号状态：{user.status === "ACTIVE" ? "正常" : user.status}
            </Tag>
          </div>

          <div className="dashboard-summary-grid">
            <Card title="当前角色">
              <Typography.Title level={3}>{displayRole}</Typography.Title>
              <Typography.Text type="secondary">
                当前账号的主要权限范围
              </Typography.Text>
            </Card>
            <Card title="账号邮箱">
              <Typography.Title level={3} ellipsis={{ tooltip: user.email }}>
                {user.email || "登录状态已恢复"}
              </Typography.Title>
              <Typography.Text type="secondary">
                用于账号识别和通知
              </Typography.Text>
            </Card>
            <Card title="快捷入口">
              <Space wrap>
                <Button type="primary" onClick={() => navigate("/resources")}>
                  浏览资源
                </Button>
                <Button onClick={() => navigate("/bookings")}>我的预约</Button>
              </Space>
            </Card>
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
