import {
  Alert,
  Button,
  Empty,
  Pagination,
  Popconfirm,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BackToDashboard from "../auth/BackToDashboard";
import "./my-bookings.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
});
const pageSize = 20;

type BookingStatus =
  "PENDING" | "CONFIRMED" | "CANCELLED" | "REJECTED" | "COMPLETED";
type Booking = {
  id: number;
  bookingNo: string;
  status: BookingStatus;
  remark: string | null;
  createdAt: string;
  resource: { id: number; code: string; name: string };
  bookingSlots: { slot: { startAt: string; endAt: string } }[];
};
type BookingPage = { items: Booking[]; total: number };

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
  }
  return "请求失败，请确认 API 正在运行后重试。";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function timeRange(booking: Booking) {
  const slots = [...booking.bookingSlots].sort((left, right) =>
    left.slot.startAt.localeCompare(right.slot.startAt),
  );
  return slots
    .map(
      ({ slot }) =>
        `${formatDate(slot.startAt)} ${formatTime(slot.startAt)} - ${formatTime(slot.endAt)}`,
    )
    .join("\n");
}

function statusColor(status: BookingStatus) {
  if (status === "PENDING") return "gold";
  if (status === "CONFIRMED") return "green";
  if (status === "REJECTED") return "red";
  return "default";
}

export default function MyBookingsApp() {
  const token = sessionStorage.getItem("accessToken");
  const [items, setItems] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<BookingPage>("/bookings", {
        params: { page, pageSize },
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelBooking(booking: Booking) {
    if (!token) return;
    setBusyId(booking.id);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/bookings/${booking.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess(`预约 ${booking.bookingNo} 已取消。`);
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
      key: "booking",
      render: (_, booking) => (
        <div className="my-bookings-primary">
          <strong>{booking.bookingNo}</strong>
          <span>#{booking.id}</span>
        </div>
      ),
    },
    {
      title: "资源",
      key: "resource",
      render: (_, booking) => (
        <div className="my-bookings-primary">
          <strong>{booking.resource.name}</strong>
          <span>{booking.resource.code}</span>
        </div>
      ),
    },
    {
      title: "时间片",
      key: "slots",
      render: (_, booking) => (
        <span className="my-bookings-slot-times">{timeRange(booking)}</span>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: BookingStatus) => (
        <Tag color={statusColor(status)}>{statusLabel[status]}</Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, booking) =>
        booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
          <Popconfirm
            title="取消这条预约？"
            description="取消后会释放关联时间片。"
            okText="确认取消"
            cancelText="返回"
            onConfirm={() => void cancelBooking(booking)}
          >
            <Button size="small" danger loading={busyId === booking.id}>
              取消预约
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <main className="my-bookings-page">
      <header className="my-bookings-header">
        <div>
          <Typography.Text className="my-bookings-eyebrow">
            用户中心
          </Typography.Text>
          <Typography.Title level={1}>我的预约</Typography.Title>
        </div>
        <BackToDashboard />
      </header>

      {!token && (
        <Alert
          className="my-bookings-alert"
          type="info"
          showIcon
          message="请先登录后查看自己的预约。"
          action={<Link to="/auth">前往登录</Link>}
        />
      )}
      {error && (
        <Alert
          className="my-bookings-alert"
          type="error"
          showIcon
          message={error}
        />
      )}
      {success && (
        <Alert
          className="my-bookings-alert"
          type="success"
          showIcon
          message={success}
        />
      )}

      <section className="my-bookings-list">
        <div className="my-bookings-heading">
          <div>
            <Typography.Title level={2}>预约记录</Typography.Title>
            <Typography.Text type="secondary">
              共 {total} 条记录
            </Typography.Text>
          </div>
          <Button onClick={() => void load()} disabled={!token || loading}>
            刷新
          </Button>
        </div>
        <Spin spinning={loading}>
          {token ? (
            <Table<Booking>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无预约记录" /> }}
              scroll={{ x: 760 }}
            />
          ) : (
            <Empty description="登录后查看预约" />
          )}
        </Spin>
        <Pagination
          className="my-bookings-pagination"
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
