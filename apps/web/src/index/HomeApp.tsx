import "./home.css";

const plannedFeatures = [
  {
    index: "01",
    title: "资源管理",
    description: "维护可预约资源的名称、编码、描述和启停状态。",
    state: "规划中",
  },
  {
    index: "02",
    title: "可预约时间",
    description: "按每周规则和固定时间片展示资源的可用时间。",
    state: "规划中",
  },
  {
    index: "03",
    title: "预约流程",
    description: "用户提交、查看和取消预约，管理员处理预约状态。",
    state: "规划中",
  },
  {
    index: "04",
    title: "角色权限",
    description: "区分普通用户、资源管理员和系统管理员的操作边界。",
    state: "规划中",
  },
  {
    index: "05",
    title: "运营审计",
    description: "记录关键操作，并为预约数量和资源使用情况提供统计基础。",
    state: "规划中",
  },
];

export default function HomeApp() {
  return (
    <main className="home-page">
      <header className="home-nav">
        <a className="brand" href="/">
          排期系统
        </a>
        <nav aria-label="主导航">
          <a href="#capabilities">核心能力</a>
          <a href="#workflow">使用流程</a>
          <a href="#status">项目状态</a>
        </nav>
        <a className="nav-login" href="/auth">
          登录 / 注册
        </a>
      </header>
      <section className="home-hero">
        <p className="home-kicker">可配置预约与资源排期系统</p>
        <h1>
          让资源、时间与预约
          <br />
          <span>在同一个清晰流程里协作。</span>
        </h1>
        <p className="home-lede">
          面向资源提供方和预约用户的模块化预约平台。先看清可用时间，再提交可靠预约。
        </p>
        <div className="home-actions">
          <a className="home-primary" href="/auth">
            立即注册
          </a>
          <a className="home-secondary" href="#capabilities">
            了解系统能力
          </a>
        </div>
        <div className="hero-proof">
          <span>
            <i /> 当前已完成：注册与登录
          </span>
          <span>
            <i className="planned" /> 资源、排期与预约：持续建设中
          </span>
        </div>
      </section>
      <section className="intro-band" id="status">
        <div>
          <p className="home-kicker">PROJECT DIRECTION</p>
          <h2>把预约前后的信息，放在同一条可理解的路径上。</h2>
        </div>
        <p>
          这是一个以真实后端问题为核心的全栈项目，围绕资源配置、时间规则、预约状态、权限边界和并发一致性逐步建设。
        </p>
      </section>
      <section className="capabilities" id="capabilities">
        <div className="section-heading">
          <div>
            <p className="home-kicker">CORE CAPABILITIES</p>
            <h2>首版计划解决的事情</h2>
          </div>
          <p>以下内容来自项目规划。当前除认证基础外，其余能力尚未宣称上线。</p>
        </div>
        <div className="capability-list">
          {plannedFeatures.map((feature) => (
            <article className="capability-row" key={feature.index}>
              <span className="feature-index">{feature.index}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <span className="feature-state">{feature.state}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="workflow" id="workflow">
        <div className="workflow-copy">
          <p className="home-kicker">HOW IT WILL WORK</p>
          <h2>从查看资源，到完成一次可追踪的预约。</h2>
          <p>
            用户浏览资源和可用时间，选择时间片提交预约；系统通过状态流转、权限校验和操作记录，让每一步都有明确结果。
          </p>
        </div>
        <ol className="workflow-steps">
          <li>
            <b>01</b>
            <span>
              查看资源
              <br />
              <small>了解资源状态和可预约日期</small>
            </span>
          </li>
          <li>
            <b>02</b>
            <span>
              选择时间
              <br />
              <small>从可用时间片中做出选择</small>
            </span>
          </li>
          <li>
            <b>03</b>
            <span>
              提交预约
              <br />
              <small>等待确认并查看状态变化</small>
            </span>
          </li>
        </ol>
      </section>
      <footer className="home-footer">
        <span>可配置预约与资源排期系统</span>
        <span>认证功能已可用 · 业务能力按计划建设</span>
        <a href="/auth">进入系统 →</a>
      </footer>
    </main>
  );
}
