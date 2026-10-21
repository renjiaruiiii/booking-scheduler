import {
  Alert,
  Button,
  Card,
  Pagination,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./bookings-admin.css";

const api = axios.create({ baseURL: "http://localhost:3000/api/v1" });
const pageSize = 20;
const statuses = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "REJECTED",
  "COMPLETED",
] as const;
type BookingStatus = (typeof statuses)[number];
type Booking = {
  id: number;
  bookingNo: string;
  status: BookingStatus;
  remark?: string | null;
  createdAt: string;
  user: { id: number; username: string; email: string };
  resource: { id: number; code: string; name: string };
  bookingSlots: { slot: { startAt: string; endAt: string } }[];
};
type BookingList = { items: Booking[]; total: number };
type BookingStats = { total: number; byStatus: Record<BookingStatus, number> };

const statusLabel: Record<BookingStatus, string> = {
  PENDING: "待确认",
  CONFIRMED: "已确认",
  CANCELLED: "已取消",
  REJECTED: "已拒绝",
  COMPLETED: "已完成",
};

function errorText(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
    if (error.response?.status === 401) return "登录状态已失效，请重新登录。";
    if (error.response?.status === 403) return "当前账号没有预约管理权限。";
  }
  return "请求失败，请确认 API 和数据库正在运行后重试。";
}

function timeRange(booking: Booking) {
  return booking.bookingSlots
    .map(({ slot }) => {
      const start = new Date(slot.startAt);
      const end = new Date(slot.endAt);
      return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}-${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    })
    .join("\n");
}

export default function BookingsAdminApp() {
  const token = sessionStorage.getItem("accessToken");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<BookingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("请先登录后访问预约管理。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [listResponse, statsResponse] = await Promise.all([
        api.get<BookingList>("/bookings/manage", {
          params: { page, pageSize },
          headers,
        }),
        api.get<BookingStats>("/bookings/manage/stats", { headers }),
      ]);
      setItems(listResponse.data.items);
      setTotal(listResponse.data.total);
      setStats(statsResponse.data);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(
    id: number,
    status: "CONFIRMED" | "REJECTED" | "COMPLETED",
  ) {
    if (!token) return;
    setBusyId(id);
    setError("");
    try {
      await api.patch(
        `/bookings/${id}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId(null);
    }
  }

  const columns: TableProps<Booking>["columns"] = [
    {
      title: "预约",
      dataIndex: "bookingNo",
      key: "bookingNo",
      render: (value: string, booking) => (
        <div className="booking-primary-cell">
          <strong>{value}</strong>
          <span>#{booking.id}</span>
        </div>
      ),
    },
    {
      title: "用户",
      key: "user",
      render: (_, booking) => (
        <div className="booking-primary-cell">
          <strong>{booking.user.username}</strong>
          <span>{booking.user.email}</span>
        </div>
      ),
    },
    {
      title: "资源",
      key: "resource",
      render: (_, booking) =>
        `${booking.resource.name} · ${booking.resource.code}`,
    },
    {
      title: "时间片",
      key: "slots",
      render: (_, booking) => (
        <span className="booking-slot-times">{timeRange(booking)}</span>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: BookingStatus) => (
        <Tag
          color={
            status === "PENDING"
              ? "gold"
              : status === "CONFIRMED"
                ? "green"
                : status === "REJECTED"
                  ? "red"
                  : "default"
          }
        >
          {statusLabel[status]}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, booking) => (
        <Space size="small" wrap>
          {booking.status === "PENDING" && (
            <>
              <Button
                size="small"
                type="primary"
                loading={busyId === booking.id}
                onClick={() => void updateStatus(booking.id, "CONFIRMED")}
              >
                确认
              </Button>
              <Popconfirm
                title="拒绝这条预约？"
                okText="拒绝预约"
                cancelText="返回"
                onConfirm={() => void updateStatus(booking.id, "REJECTED")}
              >
                <Button size="small" danger loading={busyId === booking.id}>
                  拒绝
                </Button>
              </Popconfirm>
            </>
          )}
          {booking.status === "CONFIRMED" && (
            <Button
              size="small"
              loading={busyId === booking.id}
              onClick={() => void updateStatus(booking.id, "COMPLETED")}
            >
              标记完成
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <main className="bookings-admin-page">
      <header className="bookings-admin-header">
        <div>
          <Typography.Text className="bookings-admin-eyebrow">
            管理后台
          </Typography.Text>
          <Typography.Title level={1}>预约管理</Typography.Title>
        </div>
        <Link to="/">返回首页</Link>
      </header>

      {error && (
        <Alert
          className="bookings-admin-alert"
          type="error"
          showIcon
          message={error}
        />
      )}

      {stats && (
        <section className="booking-stats" aria-label="预约状态统计">
          <Card size="small">
            <Typography.Text>预约总数</Typography.Text>
            <Typography.Title level={3}>{stats.total}</Typography.Title>
          </Card>
          {statuses.map((status) => (
            <Card size="small" key={status}>
              <Typography.Text>{statusLabel[status]}</Typography.Text>
              <Typography.Title level={3}>
                {stats.byStatus[status]}
              </Typography.Title>
            </Card>
          ))}
        </section>
      )}

      <section className="booking-list-section">
        <div className="booking-list-heading">
          <Typography.Title level={2}>预约记录</Typography.Title>
          <Button onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
        </div>
        <Spin spinning={loading}>
          <Table<Booking>
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={false}
            locale={{ emptyText: "暂无预约记录" }}
            scroll={{ x: 900 }}
          />
        </Spin>
        <Pagination
          className="booking-pagination"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger={false}
          hideOnSinglePage
          onChange={setPage}
        />
      </section>
    </main>
  );
}
