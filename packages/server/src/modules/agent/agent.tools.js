'use strict'

/**
 * AI 助手工具清单 (OpenAI function calling 协议)
 *
 * 设计原则:
 *  - 每个 tool 对应一个业务 service 方法, 通过 dispatchTable 静态映射
 *  - description 必须完整 (LLM 看不到代码, 只看 description 决定怎么调)
 *  - parameters 用 JSON Schema 表达; enum/refs 用注释提示 (LLM 需要时读上下文)
 *  - 高风险 (risk='high') 工具在执行器里走 dry-run → 用户前端确认 → 二次 POST 才落库
 *  - 业务 service 一律不动, 通过 require('@modules/<x>/<x>.service') 复用
 *
 * MVP: 招生 7 + 学员 2 + 排课 1 + 订单 2 + 辅助 1 = 13 个工具
 *      高风险已上 pay_order (后续 convert_trial / gift_student_product 走同样两阶段)
 */

const dispatchTable = {
  // ─── 招生 (7) ────────────────────────────────────────
  create_parent_with_child: {
    module: 'parent',
    fn: 'withChild',
    risk: 'write',
    perm: 'recruit.write'
  },
  search_parents: {
    module: 'parent',
    fn: 'list',
    risk: 'read',
    perm: 'recruit.read'
  },
  get_parent_detail: {
    module: 'parent',
    fn: 'detail',
    risk: 'read',
    perm: 'recruit.read'
  },
  log_parent_activity: {
    module: 'childLead',
    fn: 'createActivity',
    risk: 'write',
    perm: 'recruit.write',
    // 路径特殊: 触点是按 ChildLead 维度创建, 所以需要 parentId 先找 childLeadId
    // executor 内做一次"parentId → 该家长下任一 ChildLead._id" 解析
    resolveLeadFromParent: true
  },
  batch_schedule_trials: {
    module: 'trialBooking',
    fn: 'batchSchedule',
    risk: 'write',
    perm: 'recruit.write'
  },
  check_in_trial: {
    module: 'trialBooking',
    fn: 'checkIn',
    risk: 'write',
    perm: 'recruit.write'
  },
  complete_trial: {
    module: 'trialBooking',
    fn: 'complete',
    risk: 'write',
    perm: 'recruit.write'
  },
  convert_trial: {
    module: 'trialBooking',
    fn: 'convert',
    risk: 'high',
    perm: 'recruit.convert'
  },
  unconvert_trial: {
    module: 'childLead',
    fn: 'unconvert',
    risk: 'high',
    perm: 'recruit.convert',
    // childLead.service.unconvert 签名是 ({id, orgId, currentUser})
    // id 实际是 childLead._id (不是 trialBooking._id); executor 解析
    resolveChildLeadIdFromBooking: true
  },
  // ─── 学员 (2) ────────────────────────────────────────
  search_students: {
    module: 'student',
    fn: 'list',
    risk: 'read',
    perm: 'student.read'
  },
  get_student_detail: {
    module: 'student',
    fn: 'detail',
    risk: 'read',
    perm: 'student.read'
  },
  create_student: {
    module: 'student',
    fn: 'create',
    risk: 'write',
    perm: 'student.write'
  },
  // ─── 排课 / 考勤 (2) ────────────────────────────────────
  list_lesson_calendar: {
    module: 'lessonSchedule',
    fn: 'calendar',
    risk: 'read',
    perm: 'lessonSchedule.read'
  },
  complete_attendance: {
    module: 'lessonAttendance',
    fn: 'complete',
    risk: 'write',
    perm: 'lessonAttendance.write'
  },
  // ─── 订单 / 课包 (2) ────────────────────────────────────
  create_order: {
    module: 'order',
    fn: 'create',
    risk: 'write',
    perm: 'order.write'
  },
  pay_order: {
    module: 'order',
    fn: 'pay',
    risk: 'high',
    perm: 'order.pay'
  },
  // ─── 辅助 (1) ────────────────────────────────────────
  list_subjects: {
    module: 'subject',
    fn: 'list',
    risk: 'read',
    perm: 'subject.read'
  },

  // ─── 今日工作台 (2026-06-23 用户决策) ─────────────────────
  // 7 个新工具, 全部 read 风险 (无副作用), 用于 LLM 汇总"今日需做什么"
  today_appointments: {
    module: 'trialBooking',
    fn: 'listToday',
    risk: 'read',
    perm: 'recruit.read'
  },
  today_lessons: {
    module: 'lessonSchedule',
    fn: 'listTodayWithRoster',
    risk: 'read',
    perm: 'lessonSchedule.read'
  },
  considering_parents: {
    module: 'parent',
    fn: 'listConsidering',
    risk: 'read',
    perm: 'recruit.read'
  },
  pending_followup_parents: {
    module: 'parent',
    fn: 'listOverdue',
    risk: 'read',
    perm: 'recruit.read'
  },
  starving_pets: {
    module: 'pet',
    fn: 'listStarving',
    risk: 'read',
    perm: 'pet.read'
  },
  low_points_students: {
    module: 'points',
    fn: 'listLowBalance',
    risk: 'read',
    perm: 'points.read'
  },
  low_classpack_students: {
    module: 'studentProduct',
    fn: 'listLowRemaining',
    risk: 'read',
    perm: 'studentProduct.read'
  }
}

/**
 * 工具的 OpenAI schema 描述。
 * description 必须详尽 (含枚举、边界、关联、典型场景), LLM 据此决定何时调、如何填参。
 */
const META = {
  // ─── 招生 ────────────────────────────────────────────
  create_parent_with_child: {
    description:
      '录入一位新家长并关联一个孩子。若手机号已在同机构存在则复用 Parent(返回 {duplicate:true}); 否则新建。' +
      '按 children.trialSubjects 数组长度自动建 N 笔 TrialBooking (status=awaiting_schedule, attemptNo=1..N)。' +
      '创建后该家长 lifecycle 默认 new。',
    parameters: {
      type: 'object',
      required: ['phone', 'name'],
      properties: {
        phone: { type: 'string', description: '家长手机号, 11 位, 同 org 唯一' },
        name: { type: 'string', description: '孩子姓名' },
        gender: { type: 'string', enum: ['male', 'female', 'other'], description: '孩子性别' },
        age: { type: 'integer', description: '孩子年龄, 2-25' },
        school: { type: 'string', description: '学校 ID (School._id), 可不传' },
        grade: { type: 'string', description: '年级, 如 "三年级"' },
        className: { type: 'string', description: '班级' },
        trialSubjects: {
          type: 'array',
          items: { type: 'string' },
          description: '试听学科 ID 数组 (Subject._id); 长度决定建几笔 TrialBooking'
        },
        source: { type: 'string', description: '渠道字典 ID (Category.model=Channel)' },
        promoteBy: { type: 'string', description: '推广人 User._id' },
        consultant: { type: 'string', description: '咨询师 User._id' },
        inviteTeacher: { type: 'string', description: '邀约试听老师 User._id' },
        remark: { type: 'string', description: '备注' },
        expectedTime: { type: 'string', description: '期望试听时间描述, 如 "周末下午"' },
        force: { type: 'boolean', description: '默认 false; true 时跳过 phone 重复检查强制新建' }
      }
    }
  },
  search_parents: {
    description:
      '查询家长档案列表。支持按手机号精确查、按生命周期过滤 (new/partial/full/lost/dormant)、按来源渠道过滤、按标签过滤、按推广人/咨询师过滤、按更新时间范围过滤。' +
      '返回 {items, total, page, pageSize, scope}; scope=mine 时仅看自己录入 (销售), scope=all 时看全部 (教务/管理员/超管)。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '模糊搜索备注' },
        phone: { type: 'string', description: '精确手机号' },
        lifecycle: { type: 'string', description: '生命周期过滤, 逗号分隔支持多值' },
        tag: { type: 'string', description: '标签 ID (LeadTag 字典)' },
        source: { type: 'string', description: '渠道 ID' },
        promoteBy: { type: 'string', description: '推广人 User._id' },
        consultant: { type: 'string', description: '咨询师 User._id' },
        from: { type: 'string', description: '更新时间下限 ISO 字符串' },
        to: { type: 'string', description: '更新时间上限 ISO 字符串' },
        page: { type: 'integer', description: '页码, 默认 1' },
        pageSize: { type: 'integer', description: '每页, 默认 20' }
      }
    }
  },
  get_parent_detail: {
    description: '查家长档案详情, 含所有孩子 (ChildLead)、最近 50 条触点日志、所有 TrialBooking、家长沟通画像。',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Parent._id' }
      }
    }
  },
  log_parent_activity: {
    description:
      '为家长的某个孩子记录一次触点日志 (call/wechat/visit/sms/note)。' +
      '调用时传 parentId 与 childLeadId; 创建后自动刷 ChildLead.status (pending→contacted) 与 Parent.lastContacted。' +
      '触点备注里务必写明沟通内容。',
    parameters: {
      type: 'object',
      required: ['parentId', 'childLeadId', 'type', 'content'],
      properties: {
        parentId: { type: 'string', description: 'Parent._id' },
        childLeadId: { type: 'string', description: 'ChildLead._id' },
        type: { type: 'string', enum: ['call', 'wechat', 'visit', 'sms', 'note'], description: '触点类型' },
        content: { type: 'string', description: '触点内容 / 备注' }
      }
    }
  },
  batch_schedule_trials: {
    description:
      '批量为 N 笔 TrialBooking 排试听课。所有 bookingIds 必须都是 awaiting_schedule 状态, 否则全拒。' +
      '排课成功自动翻对应 ChildLead.status 为 scheduled。' +
      '试听时间窗 teacher/room 不做冲突检测 (招生流程临时换老师很常见)。',
    parameters: {
      type: 'object',
      required: ['bookingIds', 'plannedStartTime', 'plannedEndTime', 'teacher'],
      properties: {
        bookingIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'TrialBooking._id 数组 (通常来自 search_parents 后查到的 bookings)'
        },
        plannedStartTime: { type: 'string', description: '开始时间 ISO, 如 "2026-06-20T10:00:00+08:00"' },
        plannedEndTime: { type: 'string', description: '结束时间 ISO' },
        teacher: { type: 'string', description: '试听老师 User._id' },
        room: { type: 'string', description: '教室 Room._id (可空)' },
        notes: { type: 'string', description: '排课备注' }
      }
    }
  },
  check_in_trial: {
    description: '试听课到店打卡。把 TrialBooking.status 从 scheduled 翻为 arrived, 记录 actualStartTime。',
    parameters: {
      type: 'object',
      required: ['bookingId'],
      properties: {
        bookingId: { type: 'string', description: 'TrialBooking._id' },
        actualStartTime: { type: 'string', description: '实际到店时间 ISO, 默认 now' }
      }
    }
  },
  complete_trial: {
    description:
      '试听完成 (status → completed)。同时填 result 子文档: ' +
      'isEnrolled (true 表示家长确认报名, 此时才允许走 convert_trial); ' +
      'attractionPoint (吸引点); reasonNotEnrolled (未报名原因)。' +
      '谈单老师通过顶级 consultant 字段 (User._id) 传入, 2026-06-21 起 result.negotiateTeacher 已下线。' +
      '完成后 ChildLead.status 翻 tried。',
    parameters: {
      type: 'object',
      required: ['bookingId'],
      properties: {
        bookingId: { type: 'string', description: 'TrialBooking._id' },
        actualEndTime: { type: 'string', description: '实际下课时间 ISO' },
        consultant: { type: 'string', description: '谈单老师 User._id (顶级字段, 2026-06-21)' },
        result: {
          type: 'object',
          description: '试听结果, 至少需要 isEnrolled 字段',
          properties: {
            isEnrolled: { type: 'boolean', description: 'true=确认报名, false=未报名' },
            attractionPoint: { type: 'string', description: '吸引点 / 报名动机' },
            reasonNotEnrolled: { type: 'string', description: '未报名原因 (isEnrolled=false 时填)' }
          }
        }
      }
    }
  },
  convert_trial: {
    description:
      '【高风险,需前端二次确认】试听转学员。' +
      '前提: booking.status=completed 且 result.isEnrolled=true, 且 result.enrolledAt 未被翻转 (防并发)。' +
      '系统将自动: ① 原子翻转 enrolledAt (claim token); ② upsert User (mobile=parent.phone, 密码=手机号后 6 位, realName="家长-{孩名}", requirePasswordChange=true); ③ upsert UserOrgRel (家长职位); ④ 写回 Parent.user; ⑤ 创建 Student; ⑥ 翻 ChildLead.status=converted + 写 convertedStudent; ⑦ 重算 Parent.lifecycle。' +
      '5 分钟内可调用 unconvert_trial 撤销。',
    parameters: {
      type: 'object',
      required: ['bookingId'],
      properties: {
        bookingId: { type: 'string', description: 'TrialBooking._id' }
      }
    }
  },
  unconvert_trial: {
    description:
      '【高风险,需前端二次确认】撤销转化。仅在 convert 后 5 分钟内可调用, 且 Parent.user 不能被其他 ChildLead 占用。' +
      '会物理删除 Student (校验无下游引用) 与回滚 UserOrgRel。',
    parameters: {
      type: 'object',
      required: ['bookingId'],
      properties: {
        bookingId: { type: 'string', description: 'TrialBooking._id' }
      }
    }
  },

  // ─── 学员 ────────────────────────────────────────────
  search_students: {
    description:
      '查学员列表。支持按姓名/手机号/学校/状态/学员标签过滤。返回 {items, total, page, pageSize}。' +
      '学员标签 (meta.profileLastUpdatedBy 等) 字段较复杂, 默认不返回。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '模糊匹配学员姓名' },
        mobile: { type: 'string', description: '主监护人手机号 (查 guardians 关联)' },
        school: { type: 'string', description: '学校 School._id' },
        isActive: { type: 'boolean', description: '是否在读, 默认 true' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' }
      }
    }
  },
  get_student_detail: {
    description: '查学员档案详情 (含 guardians / school / profile 6 字段学习画像)。',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Student._id' }
      }
    }
  },
  create_student: {
    description:
      '创建学员档案。手机号对应的 User 若不存在会一并创建 (走家长转化路径); 若已存在则复用并加入 guardians。' +
      '返回 Student 文档。',
    parameters: {
      type: 'object',
      required: ['name', 'guardianMobile'],
      properties: {
        name: { type: 'string', description: '学员姓名' },
        gender: { type: 'string', enum: ['male', 'female', 'other'] },
        birthday: { type: 'string', description: '生日 ISO' },
        guardianMobile: { type: 'string', description: '主监护人手机号 (11 位)' },
        school: { type: 'string', description: '学校 School._id' },
        grade: { type: 'string' },
        className: { type: 'string' },
        notes: { type: 'string' }
      }
    }
  },

  // ─── 排课 / 考勤 ────────────────────────────────────────
  list_lesson_calendar: {
    description:
      '查机构周历视图的排课, 返回 7 天的 LessonSchedule 列表 (含 teacher / room / 报名人数 / 状态)。' +
      '参数 from/to 是日期范围, 默认本周。',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '起始日期 ISO, 如 "2026-06-16"' },
        to: { type: 'string', description: '结束日期 ISO' },
        teacher: { type: 'string', description: '老师 User._id 过滤' },
        room: { type: 'string', description: '教室 Room._id 过滤' }
      }
    }
  },
  complete_attendance: {
    description:
      '把 LessonAttendance 标记为 completed (已消课), 自动从 StudentProduct FIFO 扣 1 课时。' +
      '前提: attendance.studentProduct 非空 (有可扣的课包)。' +
      '完成后 attendance.evaluation 可填 (1-5 星课评)。',
    parameters: {
      type: 'object',
      required: ['attendanceId'],
      properties: {
        attendanceId: { type: 'string', description: 'LessonAttendance._id' },
        actualEndTime: { type: 'string', description: '实际下课时间 ISO' },
        evaluation: {
          type: 'object',
          description: '课评 (1-5 星)',
          properties: {
            score: { type: 'integer', minimum: 1, maximum: 5 },
            content: { type: 'string' },
            strengths: { type: 'string' },
            improvements: { type: 'string' }
          }
        }
      }
    }
  },

  // ─── 订单 / 课包 ────────────────────────────────────────
  create_order: {
    description:
      '创建订单 (含 items 数组, 每个 item 是 {courseProduct, quantity})。unitPrice 与 name 由 CourseProduct 当前售价快照; ' +
      'actualPrice 兜底 = originalPrice; ' +
      '若同时传 paymentMethod + paidAmount 则一气呵成付款并按 items 创建 StudentProduct (线下收款场景)。' +
      '返回订单文档; 离线收款场景额外返回 studentProducts 数组。',
    parameters: {
      type: 'object',
      required: ['student', 'items'],
      properties: {
        student: { type: 'string', description: 'Student._id' },
        items: {
          type: 'array',
          description: '订单项, 至少 1 个',
          items: {
            type: 'object',
            required: ['courseProduct', 'quantity'],
            properties: {
              courseProduct: { type: 'string', description: 'CourseProduct._id' },
              quantity: { type: 'integer', minimum: 1, default: 1 }
            }
          }
        },
        actualPrice: { type: 'number', description: '实际成交价; 不传则 = originalPrice; 范围 [0, originalPrice]' },
        paymentMethod: { type: 'string', enum: ['wechat', 'alipay', 'cash', 'other'], description: '传了就视为已收款' },
        paidAmount: { type: 'number', description: '实收金额; 与 paymentMethod 同时存在即触发"线下收款"' },
        remark: { type: 'string' }
      }
    }
  },
  pay_order: {
    description:
      '【高风险,需前端二次确认】支付 pending 订单。pending → paid + 写 paymentMethod / paidAmount / paidAt + 按 items 创建 StudentProduct (含反向绑定 CourseEnrollment)。' +
      '已支付订单不可再次支付, 需走退款流程 (未在 AI 助手中实现)。',
    parameters: {
      type: 'object',
      required: ['orderId', 'paymentMethod', 'paidAmount'],
      properties: {
        orderId: { type: 'string', description: 'Order._id' },
        paymentMethod: { type: 'string', enum: ['wechat', 'alipay', 'cash', 'other'] },
        paidAmount: { type: 'number', description: '实收金额' }
      }
    }
  },

  // ─── 辅助 ────────────────────────────────────────────
  list_subjects: {
    description: '查学科字典列表 (美术/舞蹈/编程/声乐 等), 用于排课时选择 subject。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '模糊匹配学科名' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' }
      }
    }
  },

  // ─── 今日工作台 (2026-06-23) ─────────────────────────────
  // LLM 用这一组工具回答"今天需要做什么 / 哪些家长要跟进 / 哪些宠物要喂"
  today_appointments: {
    description:
      '【今日工作台】今日 (plannedStartTime 落在今天) 待上课的试听预约。' +
      '返回 {date, items:[{phone, childName, subject, teacher, plannedStartTime, status}], teachers:[{name, mobile, trialCount}], count}。' +
      '直接覆盖用户问"今天有哪些预约要来 / 今天需要哪个老师来"。',
    parameters: { type: 'object', properties: {} }
  },
  today_lessons: {
    description:
      '【今日工作台】今日排课列表 (LessonSchedule), 含每节课的考勤名单 (学生 + 考勤状态) 与老师。' +
      '返回 {date, items:[{title, plannedStartTime, teacher, room, roster:[{studentName,status}], studentCount}], teachers:[{name, mobile, lessonCount, studentCount}], count}。' +
      '覆盖"今天有哪些课要上 / 哪个老师上 / 哪些学生上"。',
    parameters: { type: 'object', properties: {} }
  },
  considering_parents: {
    description:
      '【今日工作台】lifecycle=considering 的家长 (试听后还在犹豫)。' +
      '返回 {items:[{id, phone, daysSinceContact, lastContactedAt, source, recentTrial:{subject, teacher, completedAt}}], count}。' +
      '覆盖"哪些考虑中的家长要沟通"。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '返回条数, 默认 50, 最大 200' }
      }
    }
  },
  pending_followup_parents: {
    description:
      '【今日工作台】需跟进的潜客家长 (lifecycle ∈ {new, partial}, 且 lastContactedAt 距今 > staleDays 天, 或从未联系)。' +
      '返回 {staleDays, threshold, items:[{id, phone, lifecycle, daysSinceContact, childCount, firstChildName, source}], count}。' +
      '覆盖"哪些潜客家长需要跟进沟通"。',
    parameters: {
      type: 'object',
      properties: {
        staleDays: { type: 'integer', description: '距上次联系超过多少天视为待跟进, 默认 7; 可传 3/7/14/30' },
        limit: { type: 'integer', description: '返回条数, 默认 50, 最大 200' }
      }
    }
  },
  starving_pets: {
    description:
      '【今日工作台】快饿死的学员宠物 (PetAccount.state=alive 且 currentHunger <= threshold)。' +
      '返回 {threshold, items:[{petAccountId, studentName, nickname, species, tier, level, currentHunger, maxHunger, lastFedAt, deathThresholdDays, guardianMobile}], count}。' +
      '覆盖"哪些学生的宠物快饿死了 / 哪些宠物需要喂"。',
    parameters: {
      type: 'object',
      properties: {
        threshold: { type: 'integer', description: '饥饿度阈值 (0-1000), 默认 20' },
        limit: { type: 'integer', description: '返回条数, 默认 50, 最大 200' }
      }
    }
  },
  low_points_students: {
    description:
      '【今日工作台】积分余额低于阈值的学生 (PointsAccount.balance <= threshold)。' +
      '返回 {threshold, items:[{studentId, studentName, balance, lastTransactionAt, guardianMobile}], count}。' +
      '覆盖"哪些学生的积分快没了"。',
    parameters: {
      type: 'object',
      properties: {
        threshold: { type: 'integer', description: '余额阈值, 默认 10' },
        limit: { type: 'integer', description: '返回条数, 默认 50, 最大 200' }
      }
    }
  },
  low_classpack_students: {
    description:
      '【今日工作台】剩余课时不足的活跃课包 (StudentProduct.isActive=true 且 remainingLessons <= threshold)。' +
      '按学生聚合, 每生取剩余最少那条代表。' +
      '返回 {threshold, items:[{studentId, studentName, courseProductName, remainingLessons, totalLessons, expireDate, activePackCount, guardianMobile}], count}。' +
      '覆盖"哪些学生课包不足, 需要续费"。',
    parameters: {
      type: 'object',
      properties: {
        threshold: { type: 'integer', description: '剩余课时阈值, 默认 3' },
        limit: { type: 'integer', description: '返回条数, 默认 50, 最大 200' }
      }
    }
  }
}

/**
 * 拼装 OpenAI tools 数组 (供 chat/completions body.tools 使用)
 */
function toOpenAITools() {
  return Object.entries(META).map(([name, m]) => ({
    type: 'function',
    function: {
      name,
      description: m.description,
      parameters: m.parameters
    }
  }))
}

/**
 * 返回所有工具的元数据列表 (供 GET /agent/tools 端点暴露给前端)
 */
function listAll() {
  return Object.entries(META).map(([name, m]) => {
    const disp = dispatchTable[name] || {}
    return {
      name,
      description: m.description,
      parameters: m.parameters,
      risk: disp.risk || 'read',
      requiredPermission: disp.perm || null,
      category: categoryOf(name)
    }
  })
}

function categoryOf(name) {
  if (name.startsWith('create_parent') || name === 'search_parents' || name === 'get_parent_detail' ||
      name === 'log_parent_activity' || name.startsWith('batch_schedule') || name === 'check_in_trial' ||
      name === 'complete_trial' || name === 'convert_trial' || name === 'unconvert_trial') return 'recruit'
  if (name.startsWith('search_students') || name === 'get_student_detail' || name === 'create_student') return 'student'
  if (name === 'list_lesson_calendar' || name === 'complete_attendance') return 'schedule'
  if (name === 'create_order' || name === 'pay_order') return 'order'
  if (name === 'list_subjects') return 'helper'
  // 2026-06-23: 今日工作台 7 工具
  if (['today_appointments', 'today_lessons', 'considering_parents', 'pending_followup_parents'].includes(name)) return 'dashboard'
  if (['starving_pets', 'low_points_students', 'low_classpack_students'].includes(name)) return 'dashboard'
  return 'other'
}

module.exports = {
  dispatchTable,
  META,
  toOpenAITools,
  listAll
}