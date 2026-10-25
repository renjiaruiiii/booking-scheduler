import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
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
import { Link } from "react-router-dom";
import BackToDashboard from "../auth/BackToDashboard";
import "./resources-admin.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
});
const pageSize = 20;

type Resource = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
};
type ResourcePage = { items: Resource[]; total: number };
type ResourceForm = Pick<Resource, "code" | "name" | "description">;
type ResourceRule = {
  id: number;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};
type RuleForm = Omit<ResourceRule, "id" | "weekday" | "effectiveTo"> & {
  weekdays: number[] | number;
  effectiveTo?: string;
};
type UnavailableDate = {
  id: number;
  date: string;
  reason: string | null;
};
type UnavailableDateForm = {
  date: string;
  reason?: string;
};
type SlotGenerationRangeResult = {
  from: string;
  to: string;
  days: number;
  skippedDays: number;
  created: number;
  updated: number;
  removed: number;
};

const weekdayOptions = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const weekdaySelectOptions = [1, 2, 3, 4, 5, 6, 0].map((value) => ({
  label: weekdayOptions[value],
  value,
}));

function dateValue(value: string) {
  return value.slice(0, 10);
}

function timeValue(value: string) {
  return value.includes("T") ? value.slice(11, 16) : value.slice(0, 5);
}

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function errorText(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join("；");
    if (typeof message === "string") return message;
    if (error.response?.status === 401) return "登录状态已失效，请重新登录。";
    if (error.response?.status === 403) return "当前账号没有资源管理权限。";
  }
  return "请求失败，请确认 API 正在运行后重试。";
}

export default function ResourcesAdminApp() {
  const token = sessionStorage.getItem("accessToken");
  const [form] = Form.useForm<ResourceForm>();
  const [ruleForm] = Form.useForm<RuleForm>();
  const [items, setItems] = useState<Resource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [rulesResource, setRulesResource] = useState<Resource | null>(null);
  const [rules, setRules] = useState<ResourceRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [ruleEditing, setRuleEditing] = useState<ResourceRule | null>(null);
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [unavailableResource, setUnavailableResource] =
    useState<Resource | null>(null);
  const [unavailableDates, setUnavailableDates] = useState<UnavailableDate[]>(
    [],
  );
  const [unavailableLoading, setUnavailableLoading] = useState(false);
  const [unavailableSaving, setUnavailableSaving] = useState(false);
  const [unavailableModalOpen, setUnavailableModalOpen] = useState(false);
  const [unavailableForm] = Form.useForm<UnavailableDateForm>();
  const [generationResource, setGenerationResource] = useState<Resource | null>(
    null,
  );
  const [generationFrom, setGenerationFrom] = useState(localDateValue());
  const [generationTo, setGenerationTo] = useState(
    addDays(localDateValue(), 29),
  );
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generationResult, setGenerationResult] =
    useState<SlotGenerationRangeResult | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("请先登录后访问资源管理。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<ResourcePage>("/resources/manage", {
        params: { page, pageSize, ...(search ? { keyword: search } : {}) },
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, token]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(resource: Resource) {
    setEditing(resource);
    setModalOpen(true);
    form.setFieldsValue({
      code: resource.code,
      name: resource.name,
      description: resource.description ?? "",
    });
  }

  async function save(values: ResourceForm) {
    if (!token) return;
    setSaving(true);
    setError("");
    const headers = { Authorization: `Bearer ${token}` };
    const payload = {
      ...values,
      description: values.description || null,
    };
    try {
      if (editing) {
        await api.patch(`/resources/${editing.id}`, payload, { headers });
      } else {
        await api.post("/resources", payload, { headers });
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function setResourceStatus(resource: Resource) {
    if (!token) return;
    setError("");
    try {
      await api.patch(
        `/resources/${resource.id}/status`,
        { status: resource.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  async function loadRules(resourceId: number) {
    if (!token) return;
    setRulesLoading(true);
    try {
      const { data } = await api.get<ResourceRule[]>(
        `/resources/${resourceId}/rules`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRules(data);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setRulesLoading(false);
    }
  }

  function openRules(resource: Resource) {
    setRulesResource(resource);
    setRuleEditing(null);
    setRuleFormOpen(false);
    ruleForm.resetFields();
    setRulesModalOpen(true);
    void loadRules(resource.id);
  }

  function closeRules() {
    setRulesModalOpen(false);
    setRulesResource(null);
    setRuleEditing(null);
    setRuleFormOpen(false);
    ruleForm.resetFields();
  }

  function openCreateRule() {
    setRuleEditing(null);
    setRuleFormOpen(true);
    ruleForm.resetFields();
    ruleForm.setFieldsValue({
      weekdays: [1],
      startTime: "09:00",
      endTime: "10:00",
      slotMinutes: 30,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: "",
    });
  }

  function openEditRule(rule: ResourceRule) {
    setRuleEditing(rule);
    setRuleFormOpen(true);
    ruleForm.setFieldsValue({
      weekdays: rule.weekday,
      startTime: timeValue(rule.startTime),
      endTime: timeValue(rule.endTime),
      slotMinutes: rule.slotMinutes,
      effectiveFrom: dateValue(rule.effectiveFrom),
      effectiveTo: rule.effectiveTo ? dateValue(rule.effectiveTo) : "",
    });
  }

  async function saveRule(values: RuleForm) {
    if (!token || !rulesResource) return;
    setRulesSaving(true);
    setError("");
    const { weekdays, ...ruleValues } = values;
    const selectedWeekdays = Array.isArray(weekdays) ? weekdays : [weekdays];
    const payload = {
      ...ruleValues,
      effectiveTo: values.effectiveTo || undefined,
    };
    try {
      if (ruleEditing) {
        await api.patch(
          `/resources/${rulesResource.id}/rules/${ruleEditing.id}`,
          {
            ...payload,
            weekday: selectedWeekdays[0],
            effectiveTo: values.effectiveTo || null,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        await api.post(
          `/resources/${rulesResource.id}/rules`,
          { ...payload, weekdays: selectedWeekdays },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
      setRuleEditing(null);
      setRuleFormOpen(false);
      ruleForm.resetFields();
      await loadRules(rulesResource.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setRulesSaving(false);
    }
  }

  async function deleteRule(rule: ResourceRule) {
    if (!token || !rulesResource) return;
    try {
      await api.delete(`/resources/${rulesResource.id}/rules/${rule.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadRules(rulesResource.id);
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  async function loadUnavailableDates(resourceId: number) {
    if (!token) return;
    setUnavailableLoading(true);
    try {
      const { data } = await api.get<UnavailableDate[]>(
        `/resources/${resourceId}/unavailable-dates`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setUnavailableDates(data);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setUnavailableLoading(false);
    }
  }

  function openUnavailableDates(resource: Resource) {
    setUnavailableResource(resource);
    unavailableForm.setFieldsValue({
      date: localDateValue(),
      reason: "",
    });
    setUnavailableModalOpen(true);
    void loadUnavailableDates(resource.id);
  }

  function closeUnavailableDates() {
    setUnavailableModalOpen(false);
    setUnavailableResource(null);
    unavailableForm.resetFields();
  }

  async function saveUnavailableDate(values: UnavailableDateForm) {
    if (!token || !unavailableResource) return;
    setUnavailableSaving(true);
    setError("");
    try {
      await api.post(
        `/resources/${unavailableResource.id}/unavailable-dates`,
        { ...values, reason: values.reason || undefined },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      unavailableForm.setFieldsValue({
        date: localDateValue(),
        reason: "",
      });
      await loadUnavailableDates(unavailableResource.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setUnavailableSaving(false);
    }
  }

  async function deleteUnavailableDate(item: UnavailableDate) {
    if (!token || !unavailableResource) return;
    try {
      await api.delete(
        `/resources/${unavailableResource.id}/unavailable-dates/${item.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await loadUnavailableDates(unavailableResource.id);
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  function openSlotGeneration(resource: Resource) {
    setGenerationResource(resource);
    const from = localDateValue();
    setGenerationFrom(from);
    setGenerationTo(addDays(from, 29));
    setGenerationResult(null);
  }

  async function generateSlotsRange() {
    if (!token || !generationResource || !generationFrom || !generationTo) {
      return;
    }
    setGenerationLoading(true);
    setError("");
    try {
      const { data } = await api.post<SlotGenerationRangeResult>(
        `/resources/${generationResource.id}/slots/generate-range`,
        { from: generationFrom, to: generationTo },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setGenerationResult(data);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setGenerationLoading(false);
    }
  }

  const columns: TableProps<Resource>["columns"] = [
    {
      title: "资源",
      key: "resource",
      render: (_, resource) => (
        <div className="resource-admin-primary">
          <strong>{resource.name}</strong>
          <span>{resource.code}</span>
        </div>
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      render: (value: string | null) => value || "—",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: Resource["status"]) => (
        <Tag color={status === "ACTIVE" ? "green" : "default"}>
          {status === "ACTIVE" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, resource) => (
        <Space size="small" wrap>
          <Button size="small" onClick={() => openEdit(resource)}>
            编辑
          </Button>
          <Button size="small" onClick={() => openRules(resource)}>
            规则
          </Button>
          <Button size="small" onClick={() => openUnavailableDates(resource)}>
            排除日期
          </Button>
          <Button size="small" onClick={() => openSlotGeneration(resource)}>
            生成时间片
          </Button>
          <Popconfirm
            title={`${resource.status === "ACTIVE" ? "停用" : "启用"}此资源？`}
            okText="确定"
            cancelText="返回"
            onConfirm={() => void setResourceStatus(resource)}
          >
            <Button size="small" danger={resource.status === "ACTIVE"}>
              {resource.status === "ACTIVE" ? "停用" : "启用"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <main className="resources-admin-page">
      <header className="resources-admin-header">
        <div>
          <Typography.Text className="resources-admin-eyebrow">
            管理后台
          </Typography.Text>
          <Typography.Title level={1}>资源管理</Typography.Title>
        </div>
        <BackToDashboard />
      </header>

      {error && (
        <Alert
          className="resources-admin-alert"
          type="error"
          showIcon
          message={error}
          action={
            error.includes("登录") ? <Link to="/auth">前往登录</Link> : null
          }
        />
      )}

      <section className="resources-admin-list">
        <div className="resources-admin-toolbar">
          <div>
            <Typography.Title level={2}>资源目录</Typography.Title>
            <Typography.Text type="secondary">
              共 {total} 个资源
            </Typography.Text>
          </div>
          <Space wrap>
            <form
              className="resources-admin-search"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
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
            <Button type="primary" onClick={openCreate}>
              新建资源
            </Button>
          </Space>
        </div>

        <Spin spinning={loading}>
          <Table<Resource>
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={false}
            locale={{ emptyText: "暂无资源" }}
            scroll={{ x: 920 }}
          />
        </Spin>
        <Pagination
          className="resources-admin-pagination"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger={false}
          hideOnSinglePage
          onChange={setPage}
        />
      </section>

      <Modal
        title={editing ? "编辑资源" : "新建资源"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnHidden
      >
        <Form<ResourceForm>
          form={form}
          layout="vertical"
          onFinish={(values) => void save(values)}
          initialValues={{ description: "" }}
        >
          <Form.Item
            label="资源编码"
            name="code"
            rules={[
              { required: true, message: "请输入资源编码" },
              { min: 2, max: 50, message: "编码长度为 2 到 50 个字符" },
              {
                pattern: /^[A-Z0-9_-]+$/,
                message: "仅允许大写字母、数字、下划线和连字符",
              },
            ]}
          >
            <Input disabled={Boolean(editing)} maxLength={50} />
          </Form.Item>
          <Form.Item
            label="资源名称"
            name="name"
            rules={[
              { required: true, message: "请输入资源名称" },
              { max: 100, message: "名称最多 100 个字符" },
            ]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="描述"
            name="description"
            rules={[{ max: 2000, message: "描述最多 2000 个字符" }]}
          >
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
          <div className="resources-admin-form-actions">
            <Button
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
                form.resetFields();
              }}
            >
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={rulesResource ? `${rulesResource.name} · 每周规则` : "每周规则"}
        open={rulesModalOpen}
        onCancel={closeRules}
        footer={null}
        width={760}
        destroyOnHidden
      >
        <div className="resource-rules-toolbar">
          <Typography.Text type="secondary">
            可一次选择多个星期；排除日期不会生成时间片。
          </Typography.Text>
          <Button onClick={openCreateRule}>新增规则</Button>
        </div>
        <Spin spinning={rulesLoading}>
          <div className="resource-rules-list">
            {rules.length === 0 ? (
              <Typography.Text type="secondary">暂无每周规则</Typography.Text>
            ) : (
              rules.map((rule) => (
                <div className="resource-rule-row" key={rule.id}>
                  <div>
                    <strong>{weekdayOptions[rule.weekday]}</strong>
                    <span>
                      {timeValue(rule.startTime)} - {timeValue(rule.endTime)} ·
                      每{rule.slotMinutes} 分钟
                    </span>
                  </div>
                  <div>
                    <span>
                      {dateValue(rule.effectiveFrom)} 起
                      {rule.effectiveTo
                        ? `，至 ${dateValue(rule.effectiveTo)}`
                        : "，长期有效"}
                    </span>
                    <Space size="small">
                      <Button size="small" onClick={() => openEditRule(rule)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="删除这条规则？"
                        okText="删除"
                        cancelText="返回"
                        onConfirm={() => void deleteRule(rule)}
                      >
                        <Button size="small" danger>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>
                </div>
              ))
            )}
          </div>
        </Spin>
        {ruleFormOpen && (
          <Form<RuleForm>
            className="resource-rule-form"
            form={ruleForm}
            layout="vertical"
            onFinish={(values) => void saveRule(values)}
          >
            <Typography.Title level={4}>
              {ruleEditing ? "编辑规则" : "新增规则"}
            </Typography.Title>
            <div className="resource-rule-form-grid">
              <Form.Item
                label="星期（可多选）"
                name="weekdays"
                rules={[{ required: true, message: "至少选择一个星期" }]}
              >
                {ruleEditing ? (
                  <Select options={weekdaySelectOptions} />
                ) : (
                  <Checkbox.Group
                    className="resource-rule-weekday-options"
                    options={weekdaySelectOptions}
                  />
                )}
              </Form.Item>
              <Form.Item
                label="开始时间"
                name="startTime"
                rules={[{ required: true, message: "请选择开始时间" }]}
              >
                <Input type="time" />
              </Form.Item>
              <Form.Item
                label="结束时间"
                name="endTime"
                rules={[{ required: true, message: "请选择结束时间" }]}
              >
                <Input type="time" />
              </Form.Item>
              <Form.Item
                label="时间片长度（分钟）"
                name="slotMinutes"
                rules={[{ required: true, message: "请输入时间片长度" }]}
              >
                <InputNumber
                  min={5}
                  max={1440}
                  step={5}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item
                label="生效开始日期"
                name="effectiveFrom"
                rules={[{ required: true, message: "请选择生效开始日期" }]}
              >
                <Input type="date" />
              </Form.Item>
              <Form.Item label="生效结束日期" name="effectiveTo">
                <Input type="date" />
              </Form.Item>
            </div>
            <div className="resources-admin-form-actions">
              <Button
                onClick={() => {
                  setRuleEditing(null);
                  setRuleFormOpen(false);
                  ruleForm.resetFields();
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={rulesSaving}>
                保存规则
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      <Modal
        title={
          unavailableResource
            ? `${unavailableResource.name} · 排除日期`
            : "排除日期"
        }
        open={unavailableModalOpen}
        onCancel={closeUnavailableDates}
        footer={null}
        width={620}
        destroyOnHidden
      >
        <Form<UnavailableDateForm>
          className="unavailable-date-form"
          form={unavailableForm}
          layout="inline"
          onFinish={(values) => void saveUnavailableDate(values)}
        >
          <Form.Item
            label="日期"
            name="date"
            rules={[{ required: true, message: "请选择日期" }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item
            label="原因"
            name="reason"
            rules={[{ max: 255, message: "原因最多 255 个字符" }]}
          >
            <Input placeholder="例如：场地维护" maxLength={255} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={unavailableSaving}>
            添加
          </Button>
        </Form>
        <Spin spinning={unavailableLoading}>
          <div className="unavailable-date-list">
            {unavailableDates.length === 0 ? (
              <Typography.Text type="secondary">暂无排除日期</Typography.Text>
            ) : (
              unavailableDates.map((item) => (
                <div className="unavailable-date-row" key={item.id}>
                  <div>
                    <strong>{dateValue(item.date)}</strong>
                    <span>{item.reason || "未填写原因"}</span>
                  </div>
                  <Popconfirm
                    title="移除这个排除日期？"
                    okText="移除"
                    cancelText="返回"
                    onConfirm={() => void deleteUnavailableDate(item)}
                  >
                    <Button size="small" danger>
                      移除
                    </Button>
                  </Popconfirm>
                </div>
              ))
            )}
          </div>
        </Spin>
      </Modal>

      <Modal
        title={
          generationResource
            ? `${generationResource.name} · 生成时间片`
            : "生成时间片"
        }
        open={generationResource !== null}
        onCancel={() => {
          setGenerationResource(null);
          setGenerationResult(null);
        }}
        onOk={() => void generateSlotsRange()}
        okText="批量生成"
        cancelText="关闭"
        confirmLoading={generationLoading}
        okButtonProps={{
          disabled:
            !generationFrom || !generationTo || generationFrom > generationTo,
        }}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="开始日期" required>
            <Input
              type="date"
              value={generationFrom}
              onChange={(event) => {
                setGenerationFrom(event.target.value);
                setGenerationResult(null);
              }}
            />
          </Form.Item>
          <Form.Item label="结束日期" required>
            <Input
              type="date"
              value={generationTo}
              min={generationFrom}
              onChange={(event) => {
                setGenerationTo(event.target.value);
                setGenerationResult(null);
              }}
            />
          </Form.Item>
          <Space wrap>
            <Typography.Text type="secondary">快捷范围：</Typography.Text>
            {[7, 14, 30, 90].map((days) => (
              <Button
                key={days}
                size="small"
                disabled={!generationFrom}
                onClick={() => {
                  setGenerationTo(addDays(generationFrom, days - 1));
                  setGenerationResult(null);
                }}
              >
                {days} 天
              </Button>
            ))}
          </Space>
          <Typography.Text type="secondary">
            最多一次生成 90 天；排除日期会自动跳过。
          </Typography.Text>
        </Form>
        {generationResult && (
          <Alert
            showIcon
            type="success"
            message={`${generationResult.from} 至 ${generationResult.to} 已同步 ${generationResult.days} 天：新增 ${generationResult.created} 个，更新 ${generationResult.updated} 个，删除 ${generationResult.removed} 个，跳过排除日期 ${generationResult.skippedDays} 天。`}
          />
        )}
      </Modal>
    </main>
  );
}
