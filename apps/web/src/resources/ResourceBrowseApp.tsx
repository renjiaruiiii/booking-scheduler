import {
  Alert,
  Button,
  Empty,
  Input,
  Pagination,
  Spin,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BackToDashboard from "../auth/BackToDashboard";
import "./resource-browse.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
});
const pageSize = 20;

type Resource = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
};
type ResourcePage = { items: Resource[]; total: number };
type ResourceSlot = {
  id: number;
  slotDate: string;
  startAt: string;
  endAt: string;
  status: "AVAILABLE" | "BOOKED";
};

function today() {
  const date = new Date();
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 10);
}

function formatSlotTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  return value.slice(5).replace("-", "/");
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function errorText(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
    if (error.response?.status === 401) return "登录状态已失效，请重新登录。";
  }
  return "请求失败，请确认 API 正在运行后重试。";
}

export default function ResourceBrowseApp() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceTotal, setResourceTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [resourcePage, setResourcePage] = useState(1);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(
    null,
  );
  const initialDate = today();
  const [date, setDate] = useState(initialDate);
  const [dateRangeStart, setDateRangeStart] = useState(initialDate);
  const [slots, setSlots] = useState<ResourceSlot[]>([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadResources = useCallback(async (term: string, page: number) => {
    setLoadingResources(true);
    setError("");
    try {
      const { data } = await api.get<ResourcePage>("/resources", {
        params: {
          page,
          pageSize,
          ...(term ? { keyword: term } : {}),
        },
      });
      setResources(data.items);
      setResourceTotal(data.total);
      setSelectedResourceId((current) =>
        data.items.some((resource) => resource.id === current)
          ? current
          : (data.items[0]?.id ?? null),
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoadingResources(false);
    }
  }, []);

  useEffect(() => {
    void loadResources(search, resourcePage);
  }, [loadResources, resourcePage, search]);

  useEffect(() => {
    if (selectedResourceId === null) {
      setSlots([]);
      setSelectedSlotIds([]);
      return;
    }

    let active = true;
    setLoadingSlots(true);
    setError("");
    setSuccess("");
    setSelectedSlotIds([]);
    api
      .get<ResourceSlot[]>(`/resources/${selectedResourceId}/slots`, {
        params: { date },
      })
      .then(({ data }) => {
        if (active) setSlots(data);
      })
      .catch((requestError: unknown) => {
        if (active) setError(errorText(requestError));
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [date, selectedResourceId]);

  async function submitBooking() {
    const token = sessionStorage.getItem("accessToken");
    if (!token) {
      setError("请先登录，再提交预约。");
      return;
    }
    if (selectedResourceId === null || selectedSlotIds.length === 0) return;

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post(
        "/bookings",
        {
          resourceId: selectedResourceId,
          slotIds: selectedSlotIds,
          idempotencyKey: crypto.randomUUID(),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSuccess(`预约已提交，编号：${data.bookingNo}`);
      setSelectedSlotIds([]);
      const { data: availableSlots } = await api.get<ResourceSlot[]>(
        `/resources/${selectedResourceId}/slots`,
        { params: { date } },
      );
      setSlots(availableSlots);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedResource = resources.find(
    (resource) => resource.id === selectedResourceId,
  );
  const currentDate = today();
  const dateCards = Array.from({ length: 7 }, (_, index) =>
    addDays(dateRangeStart, index),
  );

  function toggleSlot(slotId: number) {
    setSelectedSlotIds((current) =>
      current.includes(slotId)
        ? current.filter((id) => id !== slotId)
        : [...current, slotId],
    );
  }

  function moveDateRange(days: number) {
    const minimumDate = today();
    const requestedStart = addDays(dateRangeStart, days);
    const nextStart =
      requestedStart < minimumDate ? minimumDate : requestedStart;
    setDateRangeStart(nextStart);
    setDate(nextStart);
  }

  function resetDateRange() {
    const nextDate = today();
    setDateRangeStart(nextDate);
    setDate(nextDate);
  }

  return (
    <main className="resource-browse-page">
      <header className="resource-browse-header">
        <div>
          <Typography.Text className="resource-browse-eyebrow">
            资源与排期
          </Typography.Text>
          <Typography.Title level={1}>浏览可预约资源</Typography.Title>
        </div>
        <BackToDashboard />
      </header>

      {error && (
        <Alert
          className="resource-browse-alert"
          type="error"
          showIcon
          message={error}
          action={
            error.includes("登录") ? <Link to="/auth">前往登录</Link> : null
          }
        />
      )}
      {success && (
        <Alert
          className="resource-browse-alert"
          type="success"
          showIcon
          message={success}
        />
      )}

      <div className="resource-browse-layout">
        <section className="resource-directory">
          <div className="resource-section-heading">
            <div>
              <Typography.Title level={2}>资源目录</Typography.Title>
              <Typography.Text type="secondary">
                {resourceTotal} 个可用资源
              </Typography.Text>
            </div>
            <form
              className="resource-search"
              onSubmit={(event) => {
                event.preventDefault();
                setResourcePage(1);
                setSearch(keyword.trim());
              }}
            >
              <Input
                aria-label="搜索资源"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索名称或编码"
                maxLength={100}
              />
              <Button htmlType="submit">搜索</Button>
            </form>
          </div>

          <Spin spinning={loadingResources}>
            {resources.length === 0 ? (
              <Empty description="没有找到可用资源" />
            ) : (
              <div className="resource-options">
                {resources.map((resource) => (
                  <button
                    className={`resource-option ${selectedResourceId === resource.id ? "selected" : ""}`}
                    type="button"
                    key={resource.id}
                    aria-pressed={selectedResourceId === resource.id}
                    onClick={() => setSelectedResourceId(resource.id)}
                  >
                    <span className="resource-option-code">
                      {resource.code}
                    </span>
                    <strong>{resource.name}</strong>
                    {resource.description && (
                      <span>{resource.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Spin>
          <Pagination
            className="resource-pagination"
            current={resourcePage}
            pageSize={pageSize}
            total={resourceTotal}
            showSizeChanger={false}
            hideOnSinglePage
            onChange={setResourcePage}
          />
        </section>

        <section className="availability-panel">
          <div className="resource-section-heading">
            <div>
              <Typography.Title level={2}>可预约时间</Typography.Title>
              <Typography.Text type="secondary">
                {selectedResource?.name ?? "先选择一个资源"}
              </Typography.Text>
            </div>
          </div>

          <div className="resource-date-navigation">
            <Button
              type="text"
              icon={<LeftOutlined />}
              aria-label="查看前 7 天"
              title="前 7 天"
              disabled={dateRangeStart <= currentDate}
              onClick={() => moveDateRange(-7)}
            />
            <div className="resource-date-strip" aria-label="选择预约日期">
              {dateCards.map((dateCard) => (
                <button
                  className={`resource-date-card ${dateCard === date ? "selected" : ""} ${dateCard === currentDate ? "today" : ""}`}
                  type="button"
                  key={dateCard}
                  aria-pressed={dateCard === date}
                  onClick={() => setDate(dateCard)}
                >
                  <span>{formatDateLabel(dateCard)}</span>
                  <strong>{formatWeekday(dateCard)}</strong>
                  {dateCard === currentDate && <small>今天</small>}
                </button>
              ))}
            </div>
            <Button
              type="text"
              icon={<RightOutlined />}
              aria-label="查看后 7 天"
              title="后 7 天"
              onClick={() => moveDateRange(7)}
            />
          </div>
          <div className="resource-date-actions">
            <Button size="small" onClick={resetDateRange}>
              今天
            </Button>
            <label className="resource-more-date">
              <CalendarOutlined />
              <span>更多日期</span>
              <input
                type="date"
                value={date}
                min={currentDate}
                aria-label="选择其他日期"
                onChange={(event) => {
                  const nextDate = event.target.value;
                  if (!nextDate) return;
                  setDateRangeStart(nextDate);
                  setDate(nextDate);
                }}
              />
            </label>
          </div>

          <Spin spinning={loadingSlots}>
            {slots.length === 0 ? (
              <Empty description="所选日期暂无可预约时间" />
            ) : (
              <div className="slot-timeline" aria-label={`${date} 可预约时间`}>
                {slots.map((slot) => {
                  const booked = slot.status === "BOOKED";
                  const selected = !booked && selectedSlotIds.includes(slot.id);
                  return (
                    <button
                      className={`slot-timeline-row ${selected ? "selected" : ""} ${booked ? "booked" : ""}`}
                      type="button"
                      key={slot.id}
                      aria-pressed={selected}
                      disabled={booked}
                      onClick={() => toggleSlot(slot.id)}
                    >
                      <span className="slot-timeline-time">
                        {formatSlotTime(slot.startAt)}
                      </span>
                      <span className="slot-timeline-block">
                        <strong>
                          {formatSlotTime(slot.startAt)} -{" "}
                          {formatSlotTime(slot.endAt)}
                        </strong>
                        <small>
                          {booked ? "已预约" : selected ? "已选择" : "可预约"}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Spin>

          <div className="booking-submit-row">
            <Typography.Text type="secondary">
              已选择 {selectedSlotIds.length} 个时间片
            </Typography.Text>
            <Button
              type="primary"
              disabled={
                selectedSlotIds.length === 0 || selectedResourceId === null
              }
              loading={submitting}
              onClick={() => void submitBooking()}
            >
              提交预约
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
