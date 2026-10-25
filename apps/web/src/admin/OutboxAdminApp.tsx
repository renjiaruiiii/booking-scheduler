import {
  Alert,
  Button,
  Input,
  Pagination,
  Select,
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
import "./outbox-admin.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
});
const pageSize = 20;
const statusOptions = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];
const statusLabels: Record<string, string> = {
  PENDING: "待投递",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
  FAILED: "失败",
};

type OutboxEvent = {
  id: number;
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payload: Record<string, unknown>;
  status: string;
  retryCount: number;
  nextRetryAt: string | null;
  createdAt: string;
};
type OutboxPage = { items: OutboxEvent[]; total: number };

function errorText(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
    if (error.response?.status === 401) return "登录状态已失效，请重新登录。";
    if (error.response?.status === 403) return "当前账号没有 Outbox 查看权限。";
  }
  return "请求失败，请确认 API 和数据库正在运行后重试。";
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value))
    : "-";
}

export default function OutboxAdminApp() {
  const token = sessionStorage.getItem("accessToken");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OutboxEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");
  const [aggregateType, setAggregateType] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftEventType, setDraftEventType] = useState("");
  const [draftAggregateType, setDraftAggregateType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("请先登录后访问 Outbox 管理。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<OutboxPage>("/outbox-events", {
        params: {
          page,
          pageSize,
          ...(status ? { status } : {}),
          ...(eventType ? { eventType } : {}),
          ...(aggregateType ? { aggregateType } : {}),
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
  }, [aggregateType, eventType, page, status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(draftStatus);
    setEventType(draftEventType.trim());
    setAggregateType(draftAggregateType.trim());
    setPage(1);
  }

  const columns: TableProps<OutboxEvent>["columns"] = [
    { title: "编号", dataIndex: "id", key: "id" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: string) => (
        <Tag
          color={
            value === "FAILED"
              ? "error"
              : value === "COMPLETED"
                ? "success"
                : "processing"
          }
        >
          {statusLabels[value] ?? value}
        </Tag>
      ),
    },
    { title: "事件", dataIndex: "eventType", key: "eventType" },
    {
      title: "聚合对象",
      key: "aggregate",
      render: (_, item) => `${item.aggregateType} #${item.aggregateId}`,
    },
    { title: "重试次数", dataIndex: "retryCount", key: "retryCount" },
    {
      title: "下次投递",
      dataIndex: "nextRetryAt",
      key: "nextRetryAt",
      render: (value: string | null) => formatDate(value),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => formatDate(value),
    },
    {
      title: "Payload",
      dataIndex: "payload",
      key: "payload",
      render: (value: Record<string, unknown>) => (
        <code className="outbox-payload">{JSON.stringify(value)}</code>
      ),
    },
  ];

  return (
    <main className="outbox-admin-page">
      <header className="outbox-admin-header">
        <div>
          <Typography.Text className="outbox-admin-eyebrow">
            系统管理
          </Typography.Text>
          <Typography.Title level={1}>Outbox 事件</Typography.Title>
        </div>
        <BackToDashboard />
      </header>

      {error && (
        <Alert
          className="outbox-admin-alert"
          type="error"
          showIcon
          message={error}
        />
      )}

      <section className="outbox-list-section">
        <form className="outbox-filters" onSubmit={submitFilters}>
          <Select
            allowClear
            aria-label="事件状态"
            placeholder="全部状态"
            value={draftStatus || undefined}
            options={statusOptions.map((value) => ({
              label: statusLabels[value],
              value,
            }))}
            onChange={(value) => setDraftStatus(value ?? "")}
          />
          <Input
            aria-label="事件类型"
            placeholder="事件类型，例如 BookingCreated"
            value={draftEventType}
            onChange={(event) => setDraftEventType(event.target.value)}
          />
          <Input
            aria-label="聚合类型"
            placeholder="聚合类型，例如 BOOKING"
            value={draftAggregateType}
            onChange={(event) => setDraftAggregateType(event.target.value)}
          />
          <Button htmlType="submit" type="primary">
            筛选
          </Button>
          <Button onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
        </form>

        <Spin spinning={loading}>
          <Table<OutboxEvent>
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={false}
            locale={{ emptyText: "暂无 Outbox 事件" }}
            scroll={{ x: 1200 }}
          />
        </Spin>
        <Pagination
          className="outbox-pagination"
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
