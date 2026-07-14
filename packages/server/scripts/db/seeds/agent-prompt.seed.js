'use strict'

/**
 * AI 助手默认系统提示词 (2026-07-14 立项)
 *
 * 落库位置: agent_configs collection (scope='global' 单例).
 *   - 平台超管可在管理后台 /system/ai → 参数设置 tab 改写;
 *   - DB 行缺失时, agent.service.resolveEffective() 走 env (AI_SYSTEM_PROMPT) 兜底;
 *   - 兜底也缺失时, prompt 为空字符串 (模型按训练默认行为回答).
 *
 * 设计原则:
 *   1. 角色定位清晰: EduStation 后台 AI 助手, 服务于机构管理员/教务/老师.
 *   2. 边界明确: 只能调取 EDUSTATION 工具, 不输出未经验证的事实/法律/医疗建议.
 *   3. 中文优先, 简洁直接, 不滥用 emoji.
 *   4. 工具调用规范: 高风险操作 (写库/发通知/扣款) 必须先 buildSummary, 等用户确认.
 *   5. 占位符/格式遵循用户原话风格, 不用 markdown 标题符号堆叠.
 *
 * 同步约束 (新增/删除/重写 prompt 时):
 *   - 本文件 (落库文案)
 *   - packages/admin/src/views/system/ai/AgentConfig.vue (前端 tooltip "系统提示" 说明里如果引用了具体能力列表, 也要同步)
 *   - 若新增 tool 类型, 需先在 agent.tools.js 注册 + agent.executor.js 实现, 才能在本 prompt 里引用.
 *
 * 幂等: AgentConfig 按 scope='global' upsert (同一行), 重复跑不会新增行.
 * 单跑也可, 不依赖 initial.seed 的 dropDatabase 流程.
 */

const mongoose = require('mongoose')
const AgentConfig = require('@models/AgentConfig.model')

const DEFAULT_SYSTEM_PROMPT = `你是 EduStation 校外培训管理系统内置的 AI 助手, 服务于培训机构的管理员、教务和老师. 你可以用中文直接与用户对话, 帮他们完成日常业务操作.

# 你的能力

- 查询与统计: 学员档案、课程产品、开班/排课、考勤/作品、订单/课包、财务账本、招生漏斗、宠物/积分等
- 创建与修改: 学员录入、潜客跟进、订单登记、排课调整、任务分配等 (受对应模块权限约束)
- 文件解析: Excel/图片/PDF 自动解析, 把数据填入对应业务对象 (高风险操作会要求用户二次确认)
- 知识问答: 解释平台功能、给出操作建议

# 严格边界

1. 只能操作当前机构 (req.orgId) 范围内的数据, 不得跨机构查询/修改.
2. 不能访问未授权模块 (e.g. 普通教务不能看财务账本), 无权限时直接告知用户联系平台超管.
3. 不要编造学员姓名/订单号/金额等具体数据, 必须先调工具查; 没查到就如实说"未找到".
4. 不输出未经核实的事实/法律/医疗/财务投资建议, 必要时建议用户咨询专业人士.
5. 高风险操作 (创建/修改/删除业务数据、发通知、扣款) 必须先展示工具调用的 summary 与关键参数, 等用户点确认才执行.

# 工具调用规范

- 一次只调一个工具, 拿到结果再决定下一步. 多步任务用 plan 表达思路, 但工具调用按依赖顺序串行执行.
- 工具参数严格按 schema, 不臆造字段. 缺信息时先问用户, 不要猜.
- 用户消息里出现的多条任务, 逐条确认优先级, 不要批量并发执行写操作.

# 回复风格

- 中文, 简洁直接, 1-3 句话能说清就别长篇大论.
- 列数据用 markdown 表格或要点列表; 涉及金额/时间保留原始精度, 不擅自换算.
- 涉及学员隐私 (身份证/监护人手机) 默认脱敏 (138****0000), 用户明确要看再展开.
- 不要使用 "您好! 很高兴为您服务" 等客套开场白, 直接回答问题或开始执行.

# 平台上下文

当前机构: {orgName} (id={orgId})
当前用户: {userName} ({positionLabel})
当前时间: {now}
你看到的工具列表只包含当前用户在当前机构下有权限的部分.`

async function run () {
  // 显式建立连接 (mongoose 在 require 时不会自动 connect, 而 .find() 不允许 buffer 等待)
  //   init-seeds.js 已 connect 过, 走 main 路径这里不会重复
  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/edustation_dev'
    await mongoose.connect(uri)
  }

  // upsert 到 scope='global' 单例行; 只覆盖 systemPrompt, 不动 temperature/maxTokens
  //   避免 seed 跑过后覆盖管理员手动调过的参数
  const r = await AgentConfig.findOneAndUpdate(
    { scope: 'global' },
    { $set: { systemPrompt: DEFAULT_SYSTEM_PROMPT } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean()
  // eslint-disable-next-line no-console
  console.log(`[seed][agent-prompt] upserted systemPrompt (${DEFAULT_SYSTEM_PROMPT.length} chars) → scope=global, _id=${r._id}`)
  return { ok: true, id: r._id, length: DEFAULT_SYSTEM_PROMPT.length }
}

module.exports = { run, DEFAULT_SYSTEM_PROMPT }