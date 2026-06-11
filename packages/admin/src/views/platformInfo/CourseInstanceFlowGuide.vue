<template>
  <div class="page flow-guide-page">
    <!-- 顶部说明 -->
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">
            <el-icon style="vertical-align: -2px"><Reading /></el-icon>
            开班流程与状态机说明
          </h2>
          <div class="subtitle">
            集中讲清楚"开班 (CourseInstance) → 排课 (LessonSchedule) → 加学生 (CourseEnrollment) → 上课消课 (LessonAttendance)"
            的完整业务链路、每个状态能做什么事、前往下一状态的条件，以及回到上一状态/退出的限制。
            适用于教务 / 排课老师 / 机构管理员快速对齐流程。
          </div>
        </div>
        <el-tag type="info" size="large" effect="plain">
          <el-icon><InfoFilled /></el-icon>
          <span>文档随代码更新；实现有变请同步本文件</span>
        </el-tag>
      </div>
    </el-card>

    <!-- 1. 流程总览图 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><Connection /></el-icon>
          <span class="block-title-text">1. 业务链路总览（5 个实体）</span>
        </div>
      </template>

      <div class="flow-overview">
        <el-steps :active="5" align-center finish-status="success" space="120px">
          <el-step title="CourseProduct" description="课程产品：教什么 / 卖多少钱" />
          <el-step title="CourseInstance" description="开班：哪一天 / 哪个老师 / 哪个教室" />
          <el-step title="LessonSchedule" description="排课：每一节的具体时间" />
          <el-step title="CourseEnrollment" description="报名：哪些学生在这个班" />
          <el-step title="LessonAttendance" description="考勤 + 消课：每节课学生来了没" />
        </el-steps>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 16px"
        title="链式关系（一句话版）"
        description="CourseProduct 是教学大纲 + 售卖规格；CourseInstance 把 Product 在某一天、某老师/教室开成一期班；LessonSchedule 是这期班按 schedulePlan 排出来的每一节课；CourseEnrollment 记录哪些学生加入了这个班；LessonAttendance 是某节课下某学生的考勤记录，扣课包的入口。"
      />
    </el-card>

    <!-- 2. CourseInstance 状态机 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><Reading /></el-icon>
          <span class="block-title-text">2. CourseInstance 状态机</span>
          <el-tag type="info" size="small">5 个状态</el-tag>
        </div>
      </template>

      <el-table :data="courseInstanceStateRows" border size="small">
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="label" label="中文" width="100" />
        <el-table-column prop="canDo" label="此状态下可以做什么" min-width="340" />
        <el-table-column prop="cannotDo" label="此状态下不能做什么" min-width="240" />
      </el-table>

      <h4>状态流转图</h4>
      <div class="transition-table-wrap">
        <el-table :data="courseInstanceTransitions" border size="small">
          <el-table-column prop="from" label="当前状态" width="100" />
          <el-table-column prop="to" label="→ 目标状态" width="110" />
          <el-table-column prop="guard" label="前置条件 / 守卫" min-width="380" />
          <el-table-column prop="perm" label="权限" width="160" />
        </el-table>
      </div>

      <h4>创建开班（最开始的入口）</h4>
      <ol>
        <li>在「教务管理 → 课程产品」先建好 <code>CourseProduct</code>（或选已有产品）。</li>
        <li>在「教务管理 → 开班」点「新建开班」，必填：<code>教学科目</code>、<code>课程产品</code>、<code>开课日期</code>、<code>排课计划 schedulePlan</code>（每周 N 节 + 休息日 / 上 X 休 Y）、<code>总课时 totalPlannedLessons</code>。</li>
        <li>可选：老师、教室、<code>acceptedCourseProducts</code>（默认 = [courseProduct]；配置多产品可互认课包）、<code>maxStudents</code>（仅作 UI 参考，不强制）。</li>
        <li>保存后默认 <code>status='planning'</code>（筹备）；创建时可显式指定 <code>status='enrolling'</code> 跳过筹备。</li>
      </ol>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="字段锁：非 planning 状态下 subject / name / minutesPerLesson 完全锁死"
        description="schedulePlan.mode 锁死；totalPlannedLessons 允许下调（不能上调），且新值必须 >= 已创建的 LessonSchedule 数量。"
      />

      <h4>软删（仅筹备 / 已取消可删）</h4>
      <p>状态为 <code>active / enrolling / closed</code> 的开班有业务痕迹（报名 / 排课 / 考勤），不能硬抹掉；只能 <code>cancelled</code> 走死胡同。软删 <code>DELETE /course-instances/:id</code> 需要 <strong>平台超管</strong> + 密码二次确认，仅 <code>planning / cancelled</code> 状态可执行。</p>
    </el-card>

    <!-- 3. 排课 / 报名 / 消课操作指南 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><Calendar /></el-icon>
          <span class="block-title-text">3. 在 enrolling 阶段怎么操作：排课 + 加学生</span>
          <el-tag type="success" size="small">核心动作</el-tag>
        </div>
      </template>

      <el-row :gutter="16">
        <el-col :span="12">
          <h4>3.1 排课（生成 LessonSchedule）</h4>
          <ol>
            <li>入口：开班列表点行尾「<strong>排课</strong>」按钮 → 弹出 <code>ScheduleGenerateDialog</code>。</li>
            <li>提供「单节新增」和「批量生成」两种模式：批量按 <code>schedulePlan</code> 自动展开每周的日期（<code>restDays</code> 跳过），生成 <code>totalPlannedLessons</code> 节。</li>
            <li>系统先调 <code>POST /lesson-schedules/preview</code> 给出草稿 + 冲突检测（同一老师/教室时间重叠），无冲突后再 <code>POST /lesson-schedules/generate</code> 一次性写入。</li>
            <li>生成出来的每节默认 <code>status='scheduled'</code>，老师/教室沿用开班默认值；单节课可在 <code>ScheduleEditDialog</code> 中改（代课 / 临时换场地）。</li>
          </ol>

          <el-alert
            type="warning"
            :closable="false"
            show-icon
            title="单节课可临时改老师/教室"
            description="teacher / room 在开班级只是默认值；每节 LessonSchedule 实际用谁、上哪个教室以 LessonSchedule.teacher / .room 为准。"
          />
        </el-col>
        <el-col :span="12">
          <h4>3.2 加学生（创建 CourseEnrollment）</h4>
          <ol>
            <li>入口 1：开班列表点「<strong>加学生</strong>」（仅 enrolling 状态可见）→ 弹窗批量选择学生。</li>
            <li>入口 2：在「教务管理 → 课程报名」直接新建报名，选定开班 + 学生。</li>
            <li>服务会校验：开班状态 ∈ {enrolling, active}。仅此一项，<strong>不强制</strong> StudentProduct、不强制 maxStudents（超额靠"分班"解决）。</li>
            <li>系统会按 FIFO 帮该学生选定 StudentProduct（未过期、remainingLessons&gt;0、courseProduct 在 acceptedCourseProducts 内），写入 <code>enrollment.studentProduct</code>；找不到则该字段为 null（业务信号：后续排课会跳过）。</li>
            <li>新建后 status = <code>enrolled</code>；下一次该开班任意一节「准备上课」时，<strong>自动</strong>为该学生生成 LessonAttendance（前提：持有有效课包）。</li>
          </ol>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="分班（move 业务）"
            description="开班超额时，业务上不拒绝；通过 update API 把部分学生的 courseInstance 改成另一个开班（仅 enrolled 状态可分）。"
          />
        </el-col>
      </el-row>
    </el-card>

    <!-- 4. LessonSchedule 状态机 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><Clock /></el-icon>
          <span class="block-title-text">4. LessonSchedule 状态机（上课这一节）</span>
          <el-tag type="warning" size="small">6 个状态</el-tag>
        </div>
      </template>

      <el-steps :active="0" align-center>
        <el-step title="scheduled" description="未上课" />
        <el-step title="preparing" description="准备上课" />
        <el-step title="in_progress" description="进行中" />
        <el-step title="completed" description="已结束" />
        <el-step title="archived" description="已归档" />
      </el-steps>

      <h4>状态流转表</h4>
      <el-table :data="lessonScheduleTransitions" border size="small">
        <el-table-column prop="from" label="当前状态" width="120" />
        <el-table-column prop="to" label="→ 目标" width="120" />
        <el-table-column prop="trigger" label="触发动作" width="120" />
        <el-table-column prop="guard" label="前置条件 / 守卫" min-width="380" />
        <el-table-column prop="sideEffect" label="副作用" min-width="280" />
      </el-table>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 12px"
        title="自动消课时机"
        description="finish 时本节 LessonSchedule 下所有 checked_in / scheduled 的 LessonAttendance → completed，按 FIFO 扣 StudentProduct 1 课时。leave / no_show 不动也不扣；已 completed 的幂等跳过。"
      />

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 8px"
        title="结束上课前必须先点「保存考勤」（2026-06 关键修复）"
        description="在「上课表」展开卡片改「正常/迟到/请假/未到」单选后，必须点右下角「保存考勤」按钮，这些变更才会传到后端。若直接点「结束」，后端会按未变更的 scheduled 状态自动消课并扣课时，用户标记的「请假/未到」被静默吞掉，且这些行因 status=completed 不再出现「补课」按钮，无法补救。「上课表」现在会在结束前自动拦截未保存的考勤变更并提示。"
      />

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 8px"
        title="归档判定（2026-06 修订）"
        description="仅「已消课/已补」且未写课评的考勤阻塞归档；其他状态（leave / no_show / scheduled / checked_in）都允许归档——这些学生后续走「补课」机制在 /schedule/makeup 补。"
      />
    </el-card>

    <!-- 5. LessonAttendance 状态机 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><Document /></el-icon>
          <span class="block-title-text">5. LessonAttendance 状态机（这节课这位学生的考勤）</span>
          <el-tag size="small">6 个状态</el-tag>
        </div>
      </template>

      <p class="muted">每节课下、每个报名学生对应一条 LessonAttendance。状态机区分「是否已扣课时」与「是否补课产生」两个维度。</p>

      <el-table :data="attendanceStateMachine" border size="small" style="margin-top: 8px">
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="consumed" label="是否扣课时" width="100" />
        <el-table-column prop="meaning" label="业务含义" min-width="280" />
        <el-table-column prop="transition" label="状态转换入口" min-width="320" />
      </el-table>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 12px"
        title="completed vs madeup（2026-06 区分）"
        description="两者都意味着「该考勤已扣 1 课时」，区别在来源：completed 由原课 finish 时自动消课（或手动 complete）产生；madeup 由 makeup 接口就地翻状态（原 leave/no_show/scheduled/checked_in 直接变 madeup，不再建新行），meta.originalStatus/meta.makeupAt 记录补课前的状态与补课时间。UI 上分别打「已消课」/「已补」标签；归档判定、课评要求、删除保护都把两者同等对待。"
      />

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 8px"
        title="leave / no_show 不扣课时，但可补"
        description="请假 / 未到 不触发扣课。已结束的排课可以对这些记录走 makeup 接口新建一条 madeup 考勤补回课时。"
      />
    </el-card>

    <!-- 6. CourseEnrollment 状态机 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><User /></el-icon>
          <span class="block-title-text">6. CourseEnrollment 状态机（学生在这个班）</span>
          <el-tag size="small">4 个状态</el-tag>
        </div>
      </template>

      <el-table :data="courseEnrollmentTransitions" border size="small">
        <el-table-column prop="from" label="当前" width="110" />
        <el-table-column prop="to" label="→ 目标" width="110" />
        <el-table-column prop="trigger" label="触发" width="130" />
        <el-table-column prop="guard" label="守卫 / 业务含义" min-width="380" />
      </el-table>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 12px"
        title="物理删除（误操场景）"
        description="仅 enrolled 状态可物理删除；走 DELETE /course-enrollments/:id，需平台超管 + 密码二次确认；已归档 / 退班的记录是审计依据，不允许物理抹掉。"
      />
    </el-card>

    <!-- 7. 端到端示例 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><Promotion /></el-icon>
          <span class="block-title-text">7. 端到端典型链路（Happy Path）</span>
        </div>
      </template>

      <ol class="happy-path">
        <li><strong>建产品</strong>：教务在「课程产品」建 <code>国画 48 节</code>，原价 6000 / 折扣 4800。</li>
        <li><strong>建开班</strong>：在「开班」选该产品 + 教学科目「国画」+ 老师 + 教室 + 排课计划（每周 1 节 + 周三休 + totalPlannedLessons=48）+ startDate → 保存为 <code>planning</code>。</li>
        <li><strong>改状态</strong>：列表行「改状态」→ <code>招生中 (enrolling)</code>，需填理由。</li>
        <li><strong>加学生</strong>：行「加学生」选 5 个学生（系统按 FIFO 自动绑 StudentProduct）。</li>
        <li><strong>排课</strong>：行「排课」批量生成 48 节课（scheduled）；单节可临时改老师/教室。</li>
        <li><strong>买课包</strong>：家长通过订单/赠课得到 StudentProduct（48 课时）。</li>
        <li><strong>进 active</strong>：列表「改状态」→ <code>进行中 (active)</code>。守卫：<strong>已排满 + ≥1 个有效报名 + 全部学生绑了课包</strong>。</li>
        <li><strong>上课日</strong>：教务在「上课表」对第 1 节课点「准备上课」→ 自动生成该节课 5 条 LessonAttendance（scheduled）。</li>
        <li><strong>开始上课</strong>：老师点「开始上课」→ 写 actualStartTime，状态 in_progress；可标记某学生 no_show / leave。</li>
        <li><strong>结束上课</strong>：填实际下课时间，点「结束」→ checked_in / scheduled 的考勤 → completed，按 FIFO 扣 1 课时。</li>
        <li><strong>写课评</strong>：在「上课表」展开卡片对每位已消课学生写课评。</li>
        <li><strong>归档</strong>：所有已消课学生都有课评 → 「归档」按钮可点。已消课之外的状态（leave / no_show / 补课后才来）允许先归档——这些学生后续走「/schedule/makeup 补课」补完。</li>
        <li><strong>结课</strong>：48 节全部 archived → 开班「改状态」→ <code>已结班 (closed)</code>。</li>
      </ol>

      <el-alert
        type="success"
        :closable="false"
        show-icon
        title="路径回退：enrolling → planning 与 active → enrolling"
        description="允许回退，但要求：没有任何 status = 'enrolled' 的 CourseEnrollment，且没有 LessonSchedule 记录。即「还没开始招生 + 还没排课」才能回退到 planning；「还没人报名 + 还没排课」才能从 active 回到 enrolling。"
      />
    </el-card>

    <!-- 8. 关键代码索引 -->
    <el-card shadow="never">
      <template #header>
        <div class="block-title">
          <el-icon><Connection /></el-icon>
          <span class="block-title-text">8. 关键代码索引</span>
        </div>
      </template>

      <el-table :data="codeIndex" border size="small">
        <el-table-column prop="topic" label="关注点" width="180" />
        <el-table-column prop="path" label="代码位置" min-width="340" />
        <el-table-column prop="note" label="备注" min-width="280" />
      </el-table>
    </el-card>

    <div class="footer-note">
      本页内容由代码梳理而成。如实现有变，请同步本文件。版本：2026-06。
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  Reading,
  InfoFilled,
  Connection,
  Calendar,
  Clock,
  User,
  Promotion,
  Document
} from '@element-plus/icons-vue'

const activeNames = ref(['overview', 'ci'])

// 状态常量（与 shared/enums.js 保持一致）
const STATUS_LABEL = {
  planning: '筹备',
  enrolling: '招生中',
  active: '进行中',
  closed: '已结班',
  cancelled: '已取消',
  scheduled: '未上课',
  preparing: '准备上课',
  in_progress: '进行中',
  completed: '已结束',
  archived: '已归档',
  enrolled: '在册',
  dropped: '退班',
  withdrew: '撤班'
}
const STATUS_TYPE = {
  planning: 'info',
  enrolling: 'success',
  active: 'warning',
  closed: '',
  cancelled: 'danger',
  scheduled: 'info',
  preparing: 'primary',
  in_progress: 'warning',
  completed: 'success',
  archived: '',
  enrolled: 'success',
  dropped: 'warning',
  withdrew: 'info'
}

// ── CourseInstance：每个状态能做什么 / 不能做什么 ──
const courseInstanceStateRows = [
  {
    status: 'planning',
    label: '筹备',
    canDo: '编辑 subject / name / minutesPerLesson / schedulePlan / totalPlannedLessons / maxStudents / teacher / room / startDate；改状态为「招生中」；可被软删。',
    cannotDo: '招生（CourseEnrollment 拒绝）、排课可排但没有报名无意义。'
  },
  {
    status: 'enrolling',
    label: '招生中',
    canDo: '加学生（创建 CourseEnrollment）；排课（生成 LessonSchedule）；改 maxStudents / 老师 / 教室 / 描述。',
    cannotDo: '修改 subject / name / minutesPerLesson / schedulePlan.mode；上调 totalPlannedLessons；删除开班。'
  },
  {
    status: 'active',
    label: '进行中',
    canDo: '继续排未排的课、加新学生、分班 move；处理每一节 LessonSchedule 的 prepare/start/finish/archive。',
    cannotDo: '修改 subject / name / minutesPerLesson / schedulePlan.mode；上调 totalPlannedLessons；删除开班；回到 enrolling 时要求 0 报名 + 0 排课。'
  },
  {
    status: 'closed',
    label: '已结班',
    canDo: '只读查看；状态不可再变更；不能删除。',
    cannotDo: '任何状态变更；任何字段修改。'
  },
  {
    status: 'cancelled',
    label: '已取消',
    canDo: '只读；可被超管软删。',
    cannotDo: '任何状态变更；任何业务字段修改。'
  }
]

const courseInstanceTransitions = [
  { from: 'planning', to: 'enrolling', guard: '无硬性守卫；planning 状态可自由切换。', perm: 'courseInstance.write' },
  { from: 'enrolling', to: 'planning', guard: '回退：必须 0 条 status=enrolled 的报名 + 0 节 LessonSchedule。', perm: 'courseInstance.write' },
  { from: 'enrolling', to: 'active', guard: '① totalPlannedLessons > 0；② 已排满（scheduledCount ≥ total）；③ 至少 1 个 enrolled 报名；④ 所有 enrolled 报名都绑了 StudentProduct。', perm: 'courseInstance.write' },
  { from: 'active', to: 'enrolling', guard: '回退：必须 0 条 status=enrolled 的报名 + 0 节 LessonSchedule。', perm: 'courseInstance.write' },
  { from: 'active', to: 'closed', guard: '该开班下所有 LessonSchedule.status === archived（notArchived === 0）。', perm: 'courseInstance.write' },
  { from: 'closed', to: '*', guard: '不可变更（死胡同）。', perm: '—' },
  { from: 'cancelled', to: '*', guard: '不可变更（死胡同）。', perm: '—' },
  { from: '*', to: 'cancelled', guard: '从任何状态都可切到 cancelled；仅平台超管可执行。', perm: 'isPlatformAdmin' }
]

// ── LessonSchedule：每条状态流转 ──
const lessonScheduleTransitions = [
  {
    from: 'scheduled',
    to: 'preparing',
    trigger: '准备上课',
    guard: '排课存在；CourseInstance.status === active；原状态 = scheduled。',
    sideEffect: '★ 为本开班下所有 enrolled 且有有效课包的学生生成 LessonAttendance(scheduled)；幂等（已存在跳过）。'
  },
  {
    from: 'preparing',
    to: 'in_progress',
    trigger: '开始上课',
    guard: 'CourseInstance.status === active；原状态 ∈ {preparing}（拒绝 scheduled→in_progress 的跨状态）。',
    sideEffect: '写 actualStartTime = now。'
  },
  {
    from: 'in_progress',
    to: 'completed',
    trigger: '结束上课',
    guard: '原状态 = in_progress；cancelled/completed/archived 一律拒绝；scheduled/preparing 需先 start（不可跳过）。',
    sideEffect: '写 actualEndTime；批量将 checked_in/scheduled 的考勤 → completed，按 FIFO 扣 1 课时；leave/no_show 不动也不扣。'
  },
  {
    from: 'completed',
    to: 'archived',
    trigger: '归档',
    guard: '原状态 = completed；cancelled/in_progress/scheduled 一律拒绝；再次归档幂等；「已消课/已补」考勤全部有课评。',
    sideEffect: '兜底写 actualEndTime = plannedEndTime（如空）。'
  },
  {
    from: 'cancelled',
    to: '*',
    trigger: '—',
    guard: '死胡同，不可再变更。',
    sideEffect: '—'
  }
]

// ── CourseEnrollment：状态机 ──
const courseEnrollmentTransitions = [
  { from: 'enrolled', to: 'archived', trigger: '归档', guard: '开班 active → closed 时由后端级联自动写入；个别学生可由管理员经 setStatus 手工覆盖。' },
  { from: 'enrolled', to: 'dropped', trigger: '退班（机构）', guard: '学生退班；写 droppedAt + dropReason（reason 必填）。' },
  { from: 'enrolled', to: 'withdrew', trigger: '撤班（家长）', guard: '家长撤班；写 droppedAt + dropReason（reason 必填）。' },
  { from: 'dropped', to: 'enrolled', trigger: '恢复', guard: '允许从退班恢复回在册。' },
  { from: 'withdrew', to: 'enrolled', trigger: '恢复', guard: '允许从撤班恢复回在册。' },
  { from: 'archived', to: '*', trigger: '—', guard: '死胡同，不可再变更。' }
]

// ── LessonAttendance：状态机（2026-06 引入 madeup） ──
const attendanceStateMachine = [
  { status: 'scheduled',  consumed: '否', meaning: '排课生成 / 准备上课 时批量创建的初始状态；等待学生到课。', transition: '→ checked_in / no_show / leave（前端手动登记）；finish 时 AUTO → completed。' },
  { status: 'checked_in', consumed: '否', meaning: '正常到课 / 迟到；写 actualStartTime，actualEndTime 仍空。', transition: '→ completed（手动消课或 finish 自动）；→ no_show / leave（事后改判）。' },
  { status: 'completed',  consumed: '是', meaning: '原课 finish 自动消课 / 手动 complete；StudentProduct 已扣 1 课时。', transition: '终态；写课评是后续唯一允许的修改。' },
  { status: 'madeup',     consumed: '是', meaning: '通过 makeup 接口把原考勤就地翻状态（原 leave/no_show/scheduled/checked_in 直接变 madeup，不再建新行）；StudentProduct 已扣 1 课时；meta.originalStatus 记补课前的状态、meta.makeupAt 记补课时间。', transition: '终态；写课评是后续唯一允许的修改。' },
  { status: 'no_show',    consumed: '否', meaning: '未到；不扣课时。', transition: '终态（除非排课走 makeup 创建一条 madeup 补回）。' },
  { status: 'leave',      consumed: '否', meaning: '请假；不扣课时。', transition: '终态（同 no_show）。' }
]

// ── 关键代码索引 ──
const codeIndex = [
  { topic: '开班 status 枚举', path: 'shared/enums.js · CourseInstanceStatus', note: 'planning / enrolling / active / closed / cancelled' },
  { topic: '排课 status 枚举', path: 'shared/enums.js · LessonScheduleStatus', note: 'scheduled / preparing / in_progress / completed / archived / cancelled' },
  { topic: '报名 status 枚举', path: 'shared/enums.js · CourseEnrollmentStatus', note: 'enrolled / archived / dropped / withdrew' },
  { topic: '开班 create', path: 'courseInstance.service.js · create()', note: '校验 courseProduct/subject/teacher/room/schedulePlan；可选指定初始 status' },
  { topic: '开班字段锁', path: 'courseInstance.service.js · update()', note: '非 planning：锁 subject/name/minutesPerLesson；totalPlannedLessons 只可下调' },
  { topic: '开班 setStatus 守卫', path: 'courseInstance.service.js · setStatus()', note: 'enrolling→active 的 4 条硬规则；可逆回退要求 0 报名+0 排课；active→closed 要求全部 archived' },
  { topic: '报名 create 守卫', path: 'courseEnrollment.service.js · assertCanEnroll()', note: '仅校验开班状态 ∈ {enrolling, active}；不强制 StudentProduct、不强制 maxStudents' },
  { topic: 'FIFO 选课包', path: 'courseEnrollment.service.js · create()', note: '按 expireDate 升序匹配 acceptedCourseProducts 内的有效 StudentProduct' },
  { topic: '排课 prepare', path: 'lessonSchedule.service.js · prepare()', note: 'scheduled→preparing；★ 自动生成 LessonAttendance；幂等' },
  { topic: '排课 start', path: 'lessonSchedule.service.js · start()', note: 'preparing→in_progress；拒绝 scheduled→in_progress 跨状态' },
  { topic: '排课 finish', path: 'lessonSchedule.service.js · finish()', note: 'in_progress→completed；★ 自动消课（FIFO 扣 StudentProduct）' },
  { topic: '排课 archive', path: 'lessonSchedule.service.js · archive()', note: 'completed→archived；2026-06：仅「已消课/已补」未写课评阻塞归档' },
  { topic: '排课 generate', path: 'lessonSchedule.service.js · generate()', note: '批量按 schedulePlan 排课，先 preview 再 generate' },
  { topic: '补课接口', path: 'lessonAttendance.service.js · makeup()', note: '就地把 orig.status 翻成 madeup（不建新行），StudentProduct 扣 1 课时；meta 写 originalStatus/makeupAt' },
  { topic: '补课迁移脚本', path: 'scripts/migrate-makeup-to-status-transition.js', note: '把旧版"建新行"留下的重复 madeup 合并回原考勤 + 退回多余扣课时；幂等可重跑' },
  { topic: '管理后台入口', path: 'packages/admin/src/views/courseInstances/CourseInstances.vue', note: '"加学生" 仅 enrolling 可见；"改状态"按钮走 setStatus 弹窗' }
]
</script>

<style scoped>
.flow-guide-page { display: flex; flex-direction: column; gap: 12px; }
.header-card { border: none; }
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.title { margin: 0 0 4px 0; font-size: 20px; display: flex; align-items: center; gap: 6px; }
.subtitle { color: #606266; font-size: 13px; line-height: 1.6; max-width: 880px; }

.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.block-title-text { font-weight: 600; font-size: 15px; }

h4 { margin: 14px 0 6px 0; font-size: 14px; color: #303133; }
h4:first-child { margin-top: 0; }
ul, ol { margin: 6px 0 6px 0; padding-left: 22px; line-height: 1.8; color: #303133; font-size: 13px; }
code {
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #d6336c;
}

.flow-overview { padding: 8px 0 16px; }
.transition-table-wrap { margin-top: 8px; }

.happy-path { font-size: 13px; line-height: 1.9; }
.happy-path strong { color: #303133; }

.footer-note {
  text-align: center;
  color: #909399;
  font-size: 12px;
  padding: 12px 0;
}

:deep(.el-step__title) { font-size: 13px; }
</style>
