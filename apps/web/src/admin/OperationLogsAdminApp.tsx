import {
  Alert,
  Button,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import "./operation-logs-admin.css";

const api = axios.create({ baseURL: "http://localhost:3000/api/v1" });
const pageSize = 20;
const actionOptions = [
  "BOOKING_STATUS_CHANGED",
  "USER_STATUS_CHANGED",
  "USER_ROLES_CHANGED",
  "RESOURCE_CREATED",
  "RESOURCE_UPDATED",
  "RESOURCE_STATUS_CHANGED",
  "RESOURCE_RULE_CREATED",
  "RESOURCE_RULE_UPDATED",
  "RESOURCE_RULE_DELETED",
];
const targetTypeOptions = ["BOOKING", "USER", "RESOURCE"];
const actionLabels: Record<string, string> = {
  BOOKING_STATUS_CHANGED: "预约状态变更",
  USER_STATUS_CHANGED: "用户状态变更",
  USER_ROLES_CHANGED: "用户角色变更",
  RESOURCE_CREATED: "创建资源",
  RESOURCE_UPDATED: "编辑资源",
  RESOURCE_STATUS_CHANGED: "资源状态变更",
  RESOURCE_RULE_CREATED: "新增每周预约规则",
  RESOURCE_RULE_UPDATED: "修改每周预约规则",
  RESOURCE_RULE_DELETED: "删除每周预约规则",
};
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const ruleFieldLabels: Record<string, string> = {
  weekday: "星期",
  startTime: "开始时间",
  endTime: "结束时间",
  slotMinutes: "时间片长度",
  effectiveFrom: "生效开始日期",
  effectiveTo: "生效结束日期",
};

type OperationLog = {
  id: number;
  action: string;
  targetType: string;
  targetId: number;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  operator: { id: number; username: string; email: string };
};
type OperationLogPage = { items: OperationLog[]; total: number };

function errorText(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
    if (error.response?.status === 401) return "登录状态已失效，请重新登录。";
    if (error.response?.status === 403) return "当前账号没有操作日志查看权限。";
  }
  return "请求失败，请确认 API 和数据库正在运行后重试。";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function ruleSummary(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const rule = value as Record<string, unknown>;
  if (
    typeof rule.weekday !== "number" ||
    typeof rule.startTime !== "string" ||
    typeof rule.endTime !== "string"
  )
    return "";

  const effectiveTo =
    typeof rule.effectiveTo === "string" ? rule.effectiveTo : "长期";
  return `星期${weekdays[rule.weekday] ?? rule.weekday} ${rule.startTime}–${rule.endTime} · 每片 ${rule.slotMinutes} 分钟 · 有效期 ${rule.effectiveFrom} 至 ${effectiveTo}`;
}

function formatMetadata(action: string, metadata: OperationLog["metadata"]) {
  if (!metadata) return "-";
  if (action === "RESOURCE_RULE_CREATED") {
    return `规则 #${metadata.ruleId} · ${ruleSummary(metadata)}`;
  }
  if (action === "RESOURCE_RULE_UPDATED") {
    const before = ruleSummary(metadata.before);
    const after = ruleSummary(metadata.after);
    const fields = Array.isArray(metadata.changedFields)
      ? metadata.changedFields
          .map((field) => ruleFieldLabels[String(field)] ?? String(field))
          .join("、")
      : "";
    return `规则 #${metadata.ruleId} · ${before} → ${after}${fields ? ` · 修改：${fields}` : ""}`;
  }
  if (action === "RESOURCE_RULE_DELETED") {
    return `规则 #${metadata.ruleId} · ${ruleSummary(metadata.rule)}`;
  }
  return JSON.stringify(metadata);
}

export default function OperationLogsAdminApp() {
  const token = sessionStorage.getItem("accessToken");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [draftAction, setDraftAction] = useState("");
  const [draftTargetType, setDraftTargetType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("请先登录后访问操作日志。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<OperationLogPage>("/operation-logs", {
        params: {
          page,
          pageSize,
          ...(action ? { action } : {}),
          ...(targetType ? { targetType } : {}),
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
  }, [action, page, targetType, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: TableProps<OperationLog>["columns"] = [
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => formatDate(value),
    },
    {
      title: "操作人",
      key: "operator",
      render: (_, log) => (
        <div className="operation-log-primary-cell">
          <strong>{log.operator.username}</strong>
          <span>{log.operator.email}</span>
        </div>
      ),
    },
    {
      title: "动作",
      dataIndex: "action",
      key: "action",
      render: (value: string) => actionLabels[value] ?? value,
    },
    {
      title: "目标",
      key: "target",
      render: (_, log) => {
        const targetTypeLabel =
          log.targetType === "RESOURCE"
            ? "资源"
            : log.targetType === "USER"
              ? "用户"
              : "预约";
        return `${targetTypeLabel} #${log.targetId}`;
      },
    },
    {
      title: "变更摘要",
      dataIndex: "metadata",
      key: "metadata",
      render: (metadata: OperationLog["metadata"], log) => (
        <div className="operation-log-summary-cell">
          {formatMetadata(log.action, metadata)}
        </div>
      ),
    },
  ];

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAction(draftAction);
    setTargetType(draftTargetType);
    setPage(1);
  }

  return (
    <main className="operation-logs-admin-page">
      <header className="operation-logs-admin-header">
        <div>
          <Typography.Text className="operation-logs-admin-eyebrow">
            系统管理
          </Typography.Text>
          <Typography.Title level={1}>操作日志</Typography.Title>
        </div>
        <Space wrap>
          <Link to="/admin/bookings">预约管理</Link>
          <Link to="/admin/resources">资源管理</Link>
          <Link to="/admin/outbox">Outbox 事件</Link>
          <Link to="/">返回首页</Link>
        </Space>
      </header>

      {error && (
        <Alert
          className="operation-logs-admin-alert"
          type="error"
          showIcon
          message={error}
        />
      )}

      <section className="operation-logs-list-section">
        <form className="operation-logs-filters" onSubmit={submitFilters}>
          <Select
            allowClear
            aria-label="动作"
            placeholder="全部动作"
            value={draftAction || undefined}
            options={actionOptions.map((value) => ({
              label: actionLabels[value] ?? value,
              value,
            }))}
            onChange={(value) => setDraftAction(value ?? "")}
          />
          <Select
            allowClear
            aria-label="目标类型"
            placeholder="全部目标类型"
            value={draftTargetType || undefined}
            options={targetTypeOptions.map((value) => ({
              label: value,
              value,
            }))}
            onChange={(value) => setDraftTargetType(value ?? "")}
          />
          <Button htmlType="submit" type="primary">
            筛选
          </Button>
          <Button onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
        </form>

        <Spin spinning={loading}>
          <Table<OperationLog>
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={false}
            locale={{ emptyText: "暂无操作日志" }}
            scroll={{ x: 900 }}
          />
        </Spin>
        <Pagination
          className="operation-logs-pagination"
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
