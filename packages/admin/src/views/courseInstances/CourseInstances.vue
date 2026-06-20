<template>
  <div class="page course-instances-page">
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">开班</h2>
          <div class="subtitle">一个开班对应一个教学科目 + 一套课程产品。开班后学生通过"课程报名"加入；超额时可分班到另一个开班。</div>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="openCreate">新建开班</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="filter-card">
      <el-form inline :model="filters" class="filter-form" @submit.prevent>
        <el-form-item label="开班名称">
          <el-input v-model="filters.keyword" clearable placeholder="模糊搜索" style="width: 180px" @input="onKeywordInput" />
        </el-form-item>
        <el-form-item label="科目">
          <el-select v-model="filters.subject" clearable placeholder="全部" style="width: 140px" @change="load">
            <el-option v-for="s in subjects" :key="s._id" :label="s.name" :value="s._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="老师">
          <el-select v-model="filters.teacher" clearable filterable placeholder="全部" style="width: 140px" @change="load">
            <el-option v-for="t in teachers" :key="t.id" :label="t.realName || t.mobile" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="教室">
          <el-select v-model="filters.room" clearable placeholder="全部" style="width: 140px" @change="load">
            <el-option v-for="r in rooms" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.statuses" multiple collapse-tags collapse-tags-tooltip placeholder="全部" style="width: 200px" @change="load">
            <el-option v-for="o in STATUS_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table :data="displayList" v-loading="loading" border style="margin-top: 12px">
      <el-table-column label="开班名称" min-width="180">
        <template #default="{ row }">
          <div class="cell-strong cell-link" @click="openDetail(row)">{{ row.name || '—' }}</div>
          <div class="muted">{{ row.courseProduct && row.courseProduct.name }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <!-- 状态 tag 可点击:点开看流转历史。
               与「改状态」按钮是不同职责:这里是只读查看(看历史),按钮是主动变更。
               用 status-clickable 给可点击的视觉提示: cursor:pointer + hover 高亮。 -->
          <el-tag
            :type="statusType(row.status)"
            class="status-clickable"
            @click.stop="openHistory(row)"
          >
            {{ statusLabel(row.status) }}<span class="status-hint">ⓘ</span>
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="已报 / 上限" width="140">
        <template #default="{ row }">
          <div
            class="cap-cell"
            :class="capLevel(row)"
            :title="capTitle(row)"
            @click.stop="openEnrolledList(row)"
          >
            <span class="cap-num">
              {{ row.enrolledCount || 0 }} / {{ row.maxStudents || '∞' }}
            </span>
            <span class="cap-arrow">▾</span>
          </div>
          <div v-if="capLevel(row) === 'over'" class="muted-warn">超额,需分班</div>
        </template>
      </el-table-column>
      <!--
        上课进度: 已结束 / 已归档 / 总数
        - 已结束 = status='completed'（课已上完,但还没归档）
        - 已归档 = status='archived'（课后流程跑完,家长可评价）
        - 总数   = scheduledCount（含 scheduled/preparing/in_progress/cancelled/已完成）
        - 已结束 ≥ 已归档 是正常预期：归档必须先结束；非0时给视觉提示。
      -->
      <el-table-column label="上课进度" width="160">
        <template #default="{ row }">
          <div class="class-progress">
            <span class="cp-num">{{ row.endedCount || 0 }}</span>
            <span class="cp-sep">/</span>
            <span class="cp-num">{{ row.archivedCount || 0 }}</span>
            <span class="cp-sep">/</span>
            <span class="cp-total">{{ row.scheduledCount || 0 }}</span>
          </div>
          <div class="muted">已结束 / 已归档 / 总数</div>
        </template>
      </el-table-column>
      <el-table-column label="排课进度" width="200">
        <template #default="{ row }">
          <template v-if="row.schedulePlan">
            <div>
              <el-tag v-if="row.schedulePlan.mode === 'cycle'" size="small" type="warning">
                上 {{ row.schedulePlan.cycleOnDays }} 休 {{ row.schedulePlan.cycleOffDays }}
              </el-tag>
              <el-tag v-else size="small">每周 {{ row.schedulePlan.lessonsPerWeek }} 节</el-tag>
            </div>
            <div class="schedule-progress">
              <span :class="scheduleProgressClass(row)">
                {{ row.scheduledCount || 0 }} / {{ row.schedulePlan.totalPlannedLessons }}
              </span>
              <el-tag
                v-if="scheduleState(row) === 'full'"
                size="small"
                type="success"
                effect="plain"
                style="margin-left: 6px"
              >已排满</el-tag>
              <el-tag
                v-else-if="scheduleState(row) === 'none'"
                size="small"
                type="danger"
                effect="plain"
                style="margin-left: 6px"
              >未排</el-tag>
              <el-tag
                v-else
                size="small"
                type="warning"
                effect="plain"
                style="margin-left: 6px"
              >未排满</el-tag>
            </div>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="开课 / 预计结课" width="180">
        <template #default="{ row }">
          <div>{{ formatDate(row.startDate, 'YYYY-MM-DD') }}</div>
          <div class="muted">→ {{ formatDate(row.estimatedEndDate, 'YYYY-MM-DD') || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="教学科目" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.subject" size="small" type="success">{{ row.subject.name }}</el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="老师" width="100">
        <template #default="{ row }">
          <span v-if="row.teacher">{{ row.teacher.realName || row.teacher.mobile }}</span>
          <span v-else class="muted">未指定</span>
        </template>
      </el-table-column>
      <el-table-column label="教室" width="100">
        <template #default="{ row }">
          <span v-if="row.room">{{ row.room.name }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="380" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'enrolling'" size="small" type="success" @click="openEnroll(row)">加学生</el-button>
          <el-button size="small" type="primary" @click="openScheduleDialog(row)">排课</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="canChangeStatus(row)" size="small" @click="openStatusDialog(row)">改状态</el-button>
          <el-button v-if="canCancel(row)" size="small" type="warning" @click="openCancelDialog(row)">取消</el-button>
          <!-- 「误操删除」:仅超管;前置条件:planning/cancelled 状态 + 无业务引用 -->
          <DestructiveConfirm
            v-if="canDelete(row)"
            :target="`开班 ${row.name || row.courseProduct?.name || '?'}`"
            warning="高风险"
            :precheck-notes="['开班状态为 planning/cancelled', '无报名/未归档排课/作品引用']"
            :precheck="() => courseInstanceApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onDeleteConfirm(row, p)"
          >
            <el-button size="small" type="danger">误操删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="form._id ? '编辑开班' : '新建开班'" width="640px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px">
        <!-- 1. 教学科目（决策起点：先定教什么） -->
        <el-form-item label="教学科目" required>
          <el-select v-model="form.subject" :disabled="locked" clearable placeholder="选择本班实际教学的科目" style="width: 100%">
            <el-option v-for="s in subjects" :key="s._id" :label="s.name" :value="s._id" />
          </el-select>
          <div v-if="subjectOutOfProduct" class="hint-warn">
            提示：所选科目不在该课程产品的科目范围内（仅参考，不阻塞保存）
          </div>
          <div v-if="locked" class="form-hint">筹备状态外不可修改</div>
        </el-form-item>
        <!-- 2. 开班名称 -->
        <el-form-item label="开班名称">
          <el-input v-model="form.name" :disabled="locked" maxlength="200" show-word-limit placeholder="例：2026 春季 国画 A 班" />
          <div v-if="locked" class="form-hint">筹备状态外不可修改</div>
        </el-form-item>

        <!-- 3. 排课计划 -->
        <el-divider content-position="left">排课计划</el-divider>
        <el-form-item label="模式" required>
          <el-radio-group v-model="form.schedulePlan.mode" :disabled="locked" @change="onModeChange">
            <el-radio-button value="weekly">每周 N 节</el-radio-button>
            <el-radio-button value="cycle">上 X 休 Y</el-radio-button>
          </el-radio-group>
          <div class="form-hint">
            <template v-if="form.schedulePlan.mode === 'weekly'">
              按日历周排：每周固定 N 节 + 固定休息日（如"每周二/五 + 周日休"）
            </template>
            <template v-else>
              连续滚动周期：上 N 天课休 1 天，不绑日历周（如"上 5 休 1"周一到周五上课周末轮休）
            </template>
          </div>
        </el-form-item>
        <el-form-item label="预设方案">
          <el-select v-model="form.schedulePlanPreset" :disabled="locked" style="width: 100%" @change="onPresetChange">
            <el-option v-for="p in filteredPresets" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
          <div class="form-hint">选了预设会套对应值；手动改字段会自动切到"自定义"。</div>
        </el-form-item>
        <!-- weekly 模式字段 -->
        <template v-if="form.schedulePlan.mode === 'weekly'">
          <el-form-item label="每周课次" required>
            <el-input-number v-model="form.schedulePlan.lessonsPerWeek" :disabled="locked" :min="1" :max="7" @change="onSchedulePlanManualEdit" />
          </el-form-item>
          <el-form-item label="休息日">
            <el-select v-model="form.schedulePlan.restDays" :disabled="locked" multiple collapse-tags collapse-tags-tooltip clearable placeholder="不选表示无固定休息日" style="width: 100%" @change="onSchedulePlanManualEdit">
              <el-option v-for="(label, v) in REST_DAY_LABELS" :key="v" :label="label" :value="Number(v)" />
            </el-select>
          </el-form-item>
        </template>
        <!-- cycle 模式字段 -->
        <template v-if="form.schedulePlan.mode === 'cycle'">
          <el-form-item label="上几天" required>
            <el-input-number v-model="form.schedulePlan.cycleOnDays" :disabled="locked" :min="1" :max="30" @change="onSchedulePlanManualEdit" />
          </el-form-item>
          <el-form-item label="休几天" required>
            <el-input-number v-model="form.schedulePlan.cycleOffDays" :disabled="locked" :min="1" :max="30" @change="onSchedulePlanManualEdit" />
          </el-form-item>
        </template>
        <el-form-item label="总课次" required>
          <el-input-number v-model="form.schedulePlan.totalPlannedLessons" :min="1" />
          <div v-if="locked" class="form-hint">筹备状态外不可上调；下调时不能小于已排课数</div>
        </el-form-item>
        <el-form-item label="单节时长(分钟)">
          <el-input-number v-model="form.schedulePlan.minutesPerLesson" :disabled="locked" :min="1" placeholder="不填则用课程产品的设置" />
          <div v-if="locked" class="form-hint">筹备状态外不可修改</div>
        </el-form-item>

        <!-- 4. 师资 / 教室（课程产品下移到这里） -->
        <el-divider content-position="left">师资 / 教室</el-divider>
        <el-form-item label="课程产品" required>
          <el-select v-model="form.courseProduct" placeholder="选择课程产品（课包）" style="width: 100%">
            <el-option v-for="t in products" :key="t._id" :label="t.name" :value="t._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="老师">
          <el-select v-model="form.teacher" clearable filterable placeholder="可后定" style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="t.realName || t.mobile" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="老师简介">
          <el-input v-model="form.teacherIntro" type="textarea" :rows="3" placeholder="老师尚未确定时也可先填简介" />
        </el-form-item>
        <el-form-item label="教室">
          <el-select v-model="form.room" clearable placeholder="可后定" style="width: 100%">
            <el-option v-for="r in rooms" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>

        <!-- 5. 教学特例 (override) - 仅编辑模式可见; 教务可对某些课做"开班级"覆盖 -->
        <template v-if="form._id">
          <el-divider content-position="left">教学特例</el-divider>
          <el-alert
            v-if="!form._syllabusSnapshot || !form._syllabusSnapshot.lessons || form._syllabusSnapshot.lessons.length === 0"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 8px"
          >
            <template #title>本开班尚未从科目快照教学大纲</template>
            <div>提示：开班时若教学科目未配置大纲/课件,这里没有可覆盖的源。可以到「学科」管理页先为该科目配置。</div>
          </el-alert>
          <el-alert
            v-else
            type="success"
            :closable="false"
            show-icon
            style="margin-bottom: 8px"
          >
            <template #title>
              已从科目快照教学大纲 ({{ form._syllabusSnapshot.lessons.length }} 节)
            </template>
            <div>下方表格为本开班的"特例覆盖" — 留空字段表示沿用快照,填了的字段会替换快照的对应字段。</div>
          </el-alert>

          <!-- 教学大纲特例 -->
          <el-form-item label="教学大纲特例">
            <div style="width: 100%">
              <div style="margin-bottom: 6px">
                <el-button :icon="Plus" size="small" type="primary" @click="openCiSyllabusDialog()">添加特例课时</el-button>
                <span class="form-hint">仅对要改的课次做特例,其它课次继续走快照</span>
              </div>
              <el-table :data="form.syllabusOverride.lessons" border size="small" max-height="240">
                <el-table-column prop="lessonNo" label="课次" width="70" />
                <el-table-column prop="topic" label="主题" min-width="140" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.topic" style="color: #409eff">{{ row.topic }}</span>
                    <span v-else class="muted">—</span>
                  </template>
                </el-table-column>
                <el-table-column label="内容" min-width="160" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.description" style="color: #409eff; font-size: 12px">{{ row.description }}</span>
                    <span v-else class="muted">—</span>
                  </template>
                </el-table-column>
                <el-table-column label="目标" min-width="120" show-overflow-tooltip>
                  <template #default="{ row }">
                    <template v-if="row.objectives && row.objectives.length">
                      <el-tag v-for="(o, i) in row.objectives.slice(0, 2)" :key="i" size="small" style="margin-right: 4px">{{ o }}</el-tag>
                      <el-tag v-if="row.objectives.length > 2" type="info" size="small">+{{ row.objectives.length - 2 }}</el-tag>
                    </template>
                    <span v-else class="muted">—</span>
                  </template>
                </el-table-column>
                <el-table-column prop="durationMinutes" label="时长(分)" width="80">
                  <template #default="{ row }">
                    <span v-if="row.durationMinutes">{{ row.durationMinutes }}</span>
                    <span v-else class="muted">—</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" fixed="right">
                  <template #default="{ row, $index }">
                    <el-button size="small" link type="primary" @click="openCiSyllabusDialog($index)">编辑</el-button>
                    <el-button size="small" link type="danger" @click="form.syllabusOverride.lessons.splice($index, 1)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-form-item>

          <!-- 课件特例 -->
          <el-form-item label="课件特例">
            <div style="width: 100%">
              <div style="margin-bottom: 6px">
                <el-button :icon="Plus" size="small" type="primary" @click="openCiMaterialsDialog()">添加课件特例</el-button>
                <span class="form-hint">在快照基础上追加本开班专属的课件</span>
              </div>
              <el-table :data="form.lessonMaterialsOverride.items" border size="small" max-height="240">
                <el-table-column prop="lessonNo" label="课次" width="70" />
                <el-table-column label="文件数" width="80">
                  <template #default="{ row }">
                    <span style="color: #606266">{{ (row.fileIds || []).length }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="文件" min-width="240">
                  <template #default="{ row }">
                    <template v-if="row.fileIds && row.fileIds.length">
                      <el-tag v-for="(fid, i) in row.fileIds.slice(0, 3)" :key="fid" size="small" style="margin-right: 4px">{{ materialName(fid) }}</el-tag>
                      <el-tag v-if="row.fileIds.length > 3" type="info" size="small">+{{ row.fileIds.length - 3 }}</el-tag>
                    </template>
                    <span v-else class="muted">未选择</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" fixed="right">
                  <template #default="{ row, $index }">
                    <el-button size="small" link type="primary" @click="openCiMaterialsDialog($index)">编辑</el-button>
                    <el-button size="small" link type="danger" @click="form.lessonMaterialsOverride.items.splice($index, 1)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-form-item>
        </template>

        <!-- 6. 课程介绍 -->
        <el-divider content-position="left">课程介绍</el-divider>
        <el-form-item label="课程简介">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="可填写本班特色、课程亮点等" />
        </el-form-item>

        <!-- 6. 招生 -->
        <el-divider content-position="left">招生</el-divider>
        <el-form-item label="计划开课日" required>
          <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="预计结束日">
          <span class="readonly-value">{{ formatDate(formEstimatedEndDate, 'YYYY-MM-DD') || '—' }}</span>
          <div class="form-hint">按"开课日 + ceil(总课次 / 每周课次) × 7 天"自动算，仅展示</div>
        </el-form-item>
        <el-form-item label="最大人数">
          <el-input-number v-model="form.maxStudents" :min="1" />
          <div class="form-hint">仅作 UI 参考；超额允许，通过"分班"解决。</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-tag v-if="form._id" :type="statusType(form.status)">{{ statusLabel(form.status) }}</el-tag>
          <el-select v-else v-model="form.status" style="width: 100%">
            <el-option label="筹备" value="planning" />
            <el-option label="招生中" value="enrolling" />
            <el-option label="进行中" value="active" />
            <el-option label="已结班" value="closed" />
          </el-select>
          <div v-if="form._id" class="form-hint">状态变更请用列表的「改状态」/「取消」按钮（需填写原因）</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 修改状态 弹窗（不含 cancelled） -->
    <el-dialog v-model="statusDialog" :title="`修改状态：${transferSourceLabel}`" width="480px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="当前状态">
          <el-tag :type="statusType(statusForm.from)">{{ statusLabel(statusForm.from) }}</el-tag>
        </el-form-item>
        <el-form-item label="目标状态" required>
          <el-select v-model="statusForm.toStatus" style="width: 100%">
            <el-option
              v-for="o in nextStatusOptions"
              :key="o.value"
              :label="targetOptionLabel(o)"
              :value="o.value"
              :disabled="isTargetDisabled(o.value)"
            />
          </el-select>
          <div v-if="nextStatusOptions.length === 0" class="hint-warn">当前状态无可用的下一步</div>
          <!--
            禁用的目标状态会把"为什么不能选"以"label（原因）"的形式直接展示在选项里,
            所以选中后无需再在底部单独提示。
            只对 enrolling→active / active→closed 这两条规则生效；
            回退操作(enrolling→planning / active→enrolling)的阻挡是后端在提交时校验的,
            客户端无前置数据,这里不展示。
          -->
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="statusForm.reason" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="必填，写入状态审计日志" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusDialog = false">取消</el-button>
        <el-button type="primary" :loading="statusSaving" :disabled="!statusForm.toStatus || !statusForm.reason.trim()" @click="submitStatus">确定</el-button>
      </template>
    </el-dialog>

    <!-- 教学大纲特例 编辑弹窗 (2026-06) -->
    <el-dialog
      v-model="ciSyllabusDialog"
      :title="ciSyllabusDraft.idx === null ? '新增教学大纲特例' : '编辑教学大纲特例'"
      width="640px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form :model="ciSyllabusDraft.data" label-width="100px">
        <el-form-item label="课次" required>
          <el-input-number v-model="ciSyllabusDraft.data.lessonNo" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="主题(覆盖)">
          <el-input v-model="ciSyllabusDraft.data.topic" maxlength="100" placeholder="留空表示沿用快照" />
        </el-form-item>
        <el-form-item label="内容(覆盖)">
          <el-input v-model="ciSyllabusDraft.data.description" type="textarea" :rows="4" placeholder="留空表示沿用快照" />
        </el-form-item>
        <el-form-item label="目标(覆盖)">
          <div class="obj-list">
            <div v-for="(o, i) in ciSyllabusDraft.data.objectives" :key="i" class="obj-row">
              <el-input v-model="ciSyllabusDraft.data.objectives[i]" maxlength="200" />
              <el-button link type="danger" :icon="Delete" @click="ciSyllabusDraft.data.objectives.splice(i, 1)" />
            </div>
            <el-button :icon="Plus" size="small" @click="ciSyllabusDraft.data.objectives.push('')">添加目标</el-button>
          </div>
          <div class="form-hint">留空数组 = 沿用快照；填了则替换</div>
        </el-form-item>
        <el-form-item label="时长(分)">
          <el-input-number v-model="ciSyllabusDraft.data.durationMinutes" :min="1" :max="600" placeholder="不填则沿用快照" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ciSyllabusDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCiSyllabus">确定</el-button>
      </template>
    </el-dialog>

    <!-- 课件特例 编辑弹窗 (2026-06) -->
    <el-dialog
      v-model="ciMaterialsDialog"
      :title="ciMaterialsDraft.idx === null ? '新增课件特例' : '编辑课件特例'"
      width="640px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form :model="ciMaterialsDraft.data" label-width="100px">
        <el-form-item label="课次" required>
          <el-input-number v-model="ciMaterialsDraft.data.lessonNo" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="课件文件">
          <div class="materials">
            <div v-for="(fid, i) in ciMaterialsDraft.data.fileIds" :key="fid" class="material-chip">
              <el-icon style="margin-right: 4px"><Document /></el-icon>
              <span class="text-12">{{ materialName(fid) }}</span>
              <el-button link size="small" type="danger" @click="ciMaterialsDraft.data.fileIds.splice(i, 1)">移除</el-button>
            </div>
            <el-upload
              :show-file-list="false"
              :auto-upload="true"
              :http-request="uploadCiMaterial"
              :before-upload="beforeCiMaterialUpload"
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            >
              <el-button :icon="Upload" size="small">上传新课件</el-button>
            </el-upload>
            <el-button :icon="Folder" size="small" link @click="ciMaterialPicker = true">从文件库选</el-button>
          </div>
          <div class="form-hint">支持图片 / 视频 / 音频 / PDF / Office 文件</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ciMaterialsDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCiMaterials">确定</el-button>
      </template>
    </el-dialog>

    <!-- 课件文件选择器(从文件库选) -->
    <FilePicker
      v-model="ciMaterialPicker"
      multiple
      scope="courseInstanceLessonMaterial"
      title="选择课件文件"
      @select="onPickCiMaterials"
    />

    <!-- 取消开班 弹窗(仅超管) -->
    <el-dialog v-model="cancelDialog" title="取消开班" width="480px" :close-on-click-modal="false">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px">
        <template #title>取消后开班进入死胡同状态,不可重开,只能软删</template>
      </el-alert>
      <el-form label-width="80px">
        <el-form-item label="开班">
          <span>{{ transferSourceLabel }}</span>
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="cancelReason" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="必填,写入状态审计日志" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelDialog = false">取消</el-button>
        <el-button type="warning" :loading="cancelSaving" :disabled="!cancelReason.trim()" @click="submitCancel">确定取消</el-button>
      </template>
    </el-dialog>

    <!-- 快捷报名:从某个"招生中"开班行点「加学生」打开,开班锁定 -->
    <EnrollStudentsDialog
      v-model="enrollDialog"
      :course-instance="enrollTarget"
      :title="enrollTarget ? `批量报名 · ${enrollTarget.name || enrollTarget.courseProduct?.name || '?'}` : '批量报名学生'"
      @done="load"
    />

    <!-- 已报名学生列表:从列表里点「已报 / 上限」打开,只读 -->
    <el-dialog
      v-model="enrolledDialog"
      :title="enrolledDialogTitle"
      width="560px"
      :close-on-click-modal="false"
    >
      <div v-loading="enrolledLoading">
        <div class="enrolled-summary">
          <el-tag :type="enrolledCapTagType" effect="plain" size="small">
            {{ enrolledSummary }}
          </el-tag>
          <span class="muted">点击关闭</span>
        </div>
        <el-empty
          v-if="!enrolledLoading && enrolledList.length === 0"
          description="暂无报名学生"
          :image-size="80"
        />
        <el-table v-else :data="enrolledList" size="small" border style="margin-top: 12px">
          <el-table-column label="#" type="index" width="50" />
          <el-table-column label="学生" min-width="140">
            <template #default="{ row }">{{ row.student && row.student.name || '—' }}</template>
          </el-table-column>
          <el-table-column label="性别" width="70">
            <template #default="{ row }">
              <template v-if="row.student && row.student.gender">
                {{ row.student.gender === 'male' ? '男' : row.student.gender === 'female' ? '女' : row.student.gender }}
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="enrollStatusType(row.status)">{{ enrollStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="报名时间" width="170">
            <template #default="{ row }">{{ formatDate(row.enrolledAt) }}</template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="enrolledDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 从开班行点「排课」按钮触发，开班实例预选 -->
    <ScheduleGenerateDialog
      v-model="scheduleDialog"
      :course-instance="scheduleTarget"
      @done="load"
    />

    <!-- 详情抽屉：点行名打开，展示进度 + 已排课列表 + 加一节 -->
    <el-drawer
      v-model="detailDrawer"
      :title="detailTitle"
      direction="rtl"
      size="720px"
      :close-on-click-modal="false"
    >
      <div v-loading="detailLoading" class="detail-content">
        <template v-if="detailRow">
          <!-- 顶部进度 -->
          <el-card shadow="never" class="detail-card">
            <div class="detail-progress-row">
              <div class="detail-progress-text">
                <span class="muted">排课进度：</span>
                <span :class="scheduleProgressClass(detailRow)">
                  {{ detailRow.scheduledCount || 0 }} / {{ detailRow.schedulePlan?.totalPlannedLessons || 0 }}
                </span>
                <el-tag
                  v-if="scheduleState(detailRow) === 'full'"
                  type="success"
                  effect="plain"
                  size="small"
                  style="margin-left: 8px"
                >已排满</el-tag>
                <el-tag
                  v-else-if="scheduleState(detailRow) === 'none'"
                  type="danger"
                  effect="plain"
                  size="small"
                  style="margin-left: 8px"
                >未排</el-tag>
                <el-tag
                  v-else
                  type="warning"
                  effect="plain"
                  size="small"
                  style="margin-left: 8px"
                >未排满 · 还可加 {{ (detailRow.schedulePlan?.totalPlannedLessons || 0) - (detailRow.scheduledCount || 0) }} 节</el-tag>
              </div>
              <el-button
                type="primary"
                :disabled="scheduleState(detailRow) === 'full'"
                @click="openAddLesson"
              >加一节</el-button>
            </div>
            <el-progress
              v-if="detailRow.schedulePlan?.totalPlannedLessons"
              :percentage="Math.min(100, Math.round(((detailRow.scheduledCount || 0) / detailRow.schedulePlan.totalPlannedLessons) * 100))"
              :stroke-width="10"
              style="margin-top: 12px"
            />
          </el-card>

          <!-- 概览 -->
          <el-card shadow="never" class="detail-card">
            <template #header><span class="card-title">概览</span></template>
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="开班">{{ detailRow.name || '—' }}</el-descriptions-item>
              <el-descriptions-item label="课程产品">{{ detailRow.courseProduct?.name || '—' }}</el-descriptions-item>
              <el-descriptions-item label="科目">
                <el-tag v-if="detailRow.subject" size="small" type="success">{{ detailRow.subject.name }}</el-tag>
                <span v-else class="muted">—</span>
              </el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="statusType(detailRow.status)">{{ statusLabel(detailRow.status) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="老师">{{ detailRow.teacher?.realName || detailRow.teacher?.mobile || '—' }}</el-descriptions-item>
              <el-descriptions-item label="教室">{{ detailRow.room?.name || '—' }}</el-descriptions-item>
              <el-descriptions-item label="开课日">{{ formatDate(detailRow.startDate, 'YYYY-MM-DD') }}</el-descriptions-item>
              <el-descriptions-item label="预计结课日">{{ formatDate(detailRow.estimatedEndDate, 'YYYY-MM-DD') || '—' }}</el-descriptions-item>
              <el-descriptions-item label="已报 / 上限" :span="2">
                {{ detailRow.enrolledCount || 0 }} / {{ detailRow.maxStudents || '∞' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 已排课列表 -->
          <el-card shadow="never" class="detail-card">
            <template #header>
              <div class="card-header-row">
                <span class="card-title">已排课（{{ detailSchedules.length }}）</span>
                <el-button link type="primary" @click="goScheduleList">前往排课列表</el-button>
              </div>
            </template>
            <el-empty
              v-if="!detailLoading && detailSchedules.length === 0"
              description="尚未排课"
              :image-size="80"
            />
            <el-table v-else :data="detailSchedules" border size="small">
              <el-table-column label="课次" prop="lessonNo" width="60" />
              <el-table-column label="日期" width="110">
                <template #default="{ row }">{{ formatDate(row.plannedStartTime, 'YYYY-MM-DD') }}</template>
              </el-table-column>
              <el-table-column label="时间" width="120">
                <template #default="{ row }">
                  {{ formatDate(row.plannedStartTime, 'HH:mm') }}-{{ formatDate(row.plannedEndTime, 'HH:mm') }}
                </template>
              </el-table-column>
              <el-table-column label="老师" min-width="100">
                <template #default="{ row }">{{ row.teacher?.realName || row.teacher?.mobile || '—' }}</template>
              </el-table-column>
              <el-table-column label="教室" min-width="100">
                <template #default="{ row }">{{ row.room?.name || '—' }}</template>
              </el-table-column>
              <el-table-column label="主题" prop="title" min-width="120" />
            </el-table>
          </el-card>
        </template>
      </div>
    </el-drawer>

    <!-- 加一节排课（单条创建） -->
    <AddLessonDialog
      v-model="addLessonDialog"
      :course-instance="addLessonTarget"
      @done="onAddLessonDone"
    />

    <!-- 状态流转历史:点列表里的状态 tag 触发。只读,不能改状态(改状态用「改状态」按钮)。 -->
    <el-dialog
      v-model="historyDialog"
      :title="`状态流转历史 · ${historySourceLabel}`"
      width="560px"
      :close-on-click-modal="false"
    >
      <div v-loading="historyLoading">
        <!-- 创建信息(从 statusLog 第一条若仅含 to=创建时状态 推出) -->
        <div v-if="historyRow" class="history-current">
          <span class="muted">当前状态：</span>
          <el-tag :type="statusType(historyRow.status)">{{ statusLabel(historyRow.status) }}</el-tag>
        </div>
        <el-divider v-if="historyLog.length > 0" />
        <!-- 没有任何变更:仅"创建时"那条记录也不存在时显示空态(全新 planning 开班) -->
        <el-empty
          v-if="!historyLoading && historyLog.length === 0"
          description="暂无变更记录（开班创建后未改过状态）"
          :image-size="80"
        />
        <el-timeline v-else>
          <el-timeline-item
            v-for="(item, idx) in historyLog"
            :key="idx"
            :type="idx === 0 ? 'primary' : 'info'"
            :timestamp="formatDate(item.at, 'YYYY-MM-DD HH:mm')"
            placement="top"
          >
            <div class="history-line">
              <template v-if="item.from">
                <el-tag size="small">{{ statusLabel(item.from) }}</el-tag>
                <span class="arrow">→</span>
                <el-tag size="small" :type="statusType(item.to)">{{ statusLabel(item.to) }}</el-tag>
              </template>
              <template v-else>
                <!-- 创建时指定:from 为空,只显示目标状态 -->
                <span class="muted">创建为</span>
                <el-tag size="small" :type="statusType(item.to)">{{ statusLabel(item.to) }}</el-tag>
              </template>
            </div>
            <div class="history-reason">
              <span class="muted">原因：</span>{{ item.reason || '—' }}
            </div>
            <div class="history-by">
              <span class="muted">操作人：</span>
              {{ operatorName(item.by) }}
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
      <template #footer>
        <el-button @click="historyDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Document, Folder, Upload } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import FilePicker from '@/components/FilePicker.vue'
import { courseInstanceApi } from '@/api/courseInstance'
import { handleRemoveError } from '@/utils/removable'
import { courseProductApi } from '@/api/courseProduct'
import { subjectApi } from '@/api/subject'
import { roomApi } from '@/api/room'
import { userApi } from '@/api/user'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { storageApi } from '@/api/storage'
import { formatDate } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import EnrollStudentsDialog from '@/components/EnrollStudentsDialog.vue'
import ScheduleGenerateDialog from '@/views/lessonSchedule/ScheduleGenerateDialog.vue'
import AddLessonDialog from '@/views/lessonSchedule/AddLessonDialog.vue'

const router = useRouter()

const auth = useAuthStore()

const REST_DAY_LABELS = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' }

// 排课计划预设（按 mode 区分）
const SCHEDULE_PRESETS = [
  // weekly 预设
  { mode: 'weekly', value: 'spring-autumn', label: '春秋季 · 一周一节课', plan: { lessonsPerWeek: 1, restDays: [] } },
  { mode: 'weekly', value: 'summer-winter-weekend-rest', label: '寒暑假 · 周末休（5 天/周）', plan: { lessonsPerWeek: 5, restDays: [0, 6] } },
  // cycle 预设
  { mode: 'cycle', value: 'cycle-5on1off', label: '上 5 休 1（6 天周期）', plan: { cycleOnDays: 5, cycleOffDays: 1 } },
  { mode: 'cycle', value: 'cycle-6on1off', label: '上 6 休 1（7 天周期）', plan: { cycleOnDays: 6, cycleOffDays: 1 } },
  { mode: 'cycle', value: 'cycle-3on1off', label: '上 3 休 1（4 天周期）', plan: { cycleOnDays: 3, cycleOffDays: 1 } },
  // 自定义（两种 mode 都可用）
  { mode: 'weekly', value: 'custom-weekly', label: '自定义（weekly）', plan: null },
  { mode: 'cycle', value: 'custom-cycle', label: '自定义（cycle）', plan: null }
]
// 当前 mode 下的可选预设
const filteredPresets = computed(() => {
  const mode = form.schedulePlan?.mode || 'weekly'
  return SCHEDULE_PRESETS.filter((p) => p.mode === mode && !p.value.startsWith('custom-'))
})

const STATUS_LABELS = { planning: '筹备', enrolling: '招生中', active: '进行中', closed: '已结班', cancelled: '已取消' }
const STATUS_TYPES = { planning: 'info', enrolling: 'success', active: 'warning', closed: '', cancelled: 'danger' }
// 列表筛选用状态选项：移除 cancelled（死胡同状态，列表里不需要）
const STATUS_OPTIONS = [
  { value: 'planning', label: STATUS_LABELS.planning },
  { value: 'enrolling', label: STATUS_LABELS.enrolling },
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'closed', label: STATUS_LABELS.closed }
]
// 排序优先级：筹备 → 招生中 → 进行中 → 已结班 → 已取消
// cancelled 仍在表里兜底（理论上筛不掉，但它在 STATUS_OPTIONS 里被拿掉后，正常流程不会再出现）
const STATUS_ORDER = { planning: 0, enrolling: 1, active: 2, closed: 3, cancelled: 4 }
// 状态筛选项的默认值：默认不选"已结班"和"已取消"（用户偏好"看到还在跑的班"）
const DEFAULT_STATUS_FILTER = ['planning', 'enrolling', 'active']

// 状态机：每种状态允许的下一步（与 service.setStatus 的 allowedNext 保持一致）
const STATUS_NEXT = {
  planning: [{ value: 'enrolling', label: '招生中' }],
  enrolling: [
    { value: 'planning', label: '筹备（回退）' },
    { value: 'active', label: '进行中' }
  ],
  active: [
    { value: 'enrolling', label: '招生中（回退）' },
    { value: 'closed', label: '已结班' }
  ],
  closed: [],
  cancelled: []
}

const list = ref([])
const products = ref([])
const subjects = ref([])
const teachers = ref([])
const rooms = ref([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)

// 列表筛选：状态默认排除"已结班"（用户偏好看"在跑"的班）
const filters = reactive({
  keyword: '',
  subject: '',
  teacher: '',
  room: '',
  statuses: [...DEFAULT_STATUS_FILTER]
})

// 搜索框 300ms 防抖：避免每按一个键就触发一次 load
let keywordTimer = null
function onKeywordInput() {
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    keywordTimer = null
    load()
  }, 300)
}

// 列表展示顺序：按状态优先级排，同状态内按开课日倒序
const displayList = computed(() => {
  return [...list.value].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99
    const sb = STATUS_ORDER[b.status] ?? 99
    if (sa !== sb) return sa - sb
    const da = a.startDate ? new Date(a.startDate).getTime() : 0
    const db = b.startDate ? new Date(b.startDate).getTime() : 0
    return db - da
  })
})

const defaultSchedulePlan = () => ({
  mode: 'weekly',
  lessonsPerWeek: 1,
  restDays: [],
  cycleOnDays: null,
  cycleOffDays: null,
  totalPlannedLessons: 16,
  minutesPerLesson: 90
})

const form = reactive({
  _id: null,
  subject: '',
  name: '',
  description: '',
  teacherIntro: '',
  courseProduct: '',
  teacher: '',
  room: '',
  schedulePlanPreset: 'spring-autumn',
  schedulePlan: defaultSchedulePlan(),
  startDate: '',
  maxStudents: 10,
  status: 'planning'
})

// 是否处于锁字段状态（非 planning）
const locked = computed(() => !!form._id && form.status !== 'planning')

// 表单内"预计结束日"实时预览（按当前 startDate + schedulePlan 算）
const formEstimatedEndDate = computed(() => {
  if (!form.startDate || !form.schedulePlan?.totalPlannedLessons) return null
  const sp = form.schedulePlan
  let days = null
  if (sp.mode === 'cycle') {
    if (!sp.cycleOnDays || !sp.cycleOffDays) return null
    const cycleLen = Number(sp.cycleOnDays) + Number(sp.cycleOffDays)
    const cycles = Math.ceil(sp.totalPlannedLessons / sp.cycleOnDays)
    days = cycles * cycleLen
  } else {
    if (!sp.lessonsPerWeek) return null
    const weeks = Math.ceil(sp.totalPlannedLessons / sp.lessonsPerWeek)
    days = weeks * 7
  }
  const d = new Date(form.startDate)
  d.setDate(d.getDate() + days)
  return d
})

// 修改状态弹窗
const statusDialog = ref(false)
const statusSaving = ref(false)
const statusForm = reactive({ from: '', toStatus: '', reason: '' })

// ── 教学特例弹窗(2026-06) ──
const ciSyllabusDialog = ref(false)
const ciSyllabusDraft = reactive({ idx: null, data: { lessonNo: 1, topic: '', description: '', objectives: [], durationMinutes: null } })
function emptyCiSyllabusDraft() {
  return { lessonNo: 1, topic: '', description: '', objectives: [], durationMinutes: null }
}
function openCiSyllabusDialog(idx) {
  if (idx == null) {
    ciSyllabusDraft.idx = null
    Object.assign(ciSyllabusDraft.data, emptyCiSyllabusDraft())
  } else {
    const src = form.syllabusOverride.lessons[idx]
    ciSyllabusDraft.idx = idx
    Object.assign(ciSyllabusDraft.data, {
      lessonNo: src.lessonNo,
      topic: src.topic || '',
      description: src.description || '',
      objectives: Array.isArray(src.objectives) ? [...src.objectives] : [],
      durationMinutes: src.durationMinutes != null ? Number(src.durationMinutes) : null
    })
  }
  ciSyllabusDialog.value = true
}
function confirmCiSyllabus() {
  const d = ciSyllabusDraft.data
  const cleaned = {
    lessonNo: Number(d.lessonNo),
    topic: (d.topic || '').trim(),
    description: d.description || '',
    objectives: (d.objectives || []).map((o) => (o || '').trim()).filter(Boolean),
    durationMinutes: d.durationMinutes != null && d.durationMinutes > 0 ? Number(d.durationMinutes) : null
  }
  if (ciSyllabusDraft.idx == null) {
    if (form.syllabusOverride.lessons.some((l) => l.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的特例已存在`)
    }
    form.syllabusOverride.lessons.push(cleaned)
  } else {
    const oldNo = form.syllabusOverride.lessons[ciSyllabusDraft.idx].lessonNo
    if (oldNo !== cleaned.lessonNo && form.syllabusOverride.lessons.some((l) => l.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的特例已存在`)
    }
    form.syllabusOverride.lessons.splice(ciSyllabusDraft.idx, 1, cleaned)
  }
  form.syllabusOverride.lessons.sort((a, b) => a.lessonNo - b.lessonNo)
  ciSyllabusDialog.value = false
}

const ciMaterialsDialog = ref(false)
const ciMaterialsDraft = reactive({ idx: null, data: { lessonNo: 1, fileIds: [] } })
const ciMaterialPicker = ref(false)
function emptyCiMaterialsDraft() {
  return { lessonNo: 1, fileIds: [] }
}
function openCiMaterialsDialog(idx) {
  if (idx == null) {
    ciMaterialsDraft.idx = null
    Object.assign(ciMaterialsDraft.data, emptyCiMaterialsDraft())
  } else {
    const src = form.lessonMaterialsOverride.items[idx]
    ciMaterialsDraft.idx = idx
    Object.assign(ciMaterialsDraft.data, {
      lessonNo: src.lessonNo,
      fileIds: (src.fileIds || []).map(String)
    })
  }
  ciMaterialsDialog.value = true
}
function confirmCiMaterials() {
  const d = ciMaterialsDraft.data
  const cleaned = {
    lessonNo: Number(d.lessonNo),
    fileIds: (d.fileIds || []).filter((x) => x != null).map((x) => String(x))
  }
  if (ciMaterialsDraft.idx == null) {
    if (form.lessonMaterialsOverride.items.some((it) => it.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的课件特例已存在`)
    }
    form.lessonMaterialsOverride.items.push(cleaned)
  } else {
    const oldNo = form.lessonMaterialsOverride.items[ciMaterialsDraft.idx].lessonNo
    if (oldNo !== cleaned.lessonNo && form.lessonMaterialsOverride.items.some((it) => it.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的课件特例已存在`)
    }
    form.lessonMaterialsOverride.items.splice(ciMaterialsDraft.idx, 1, cleaned)
  }
  form.lessonMaterialsOverride.items.sort((a, b) => a.lessonNo - b.lessonNo)
  ciMaterialsDialog.value = false
}

// 课件名称缓存(fileId -> 显示名)
const ciMaterialNames = reactive(new Map())
function materialName(id) {
  return ciMaterialNames.get(String(id)) || String(id).slice(-6)
}

function beforeCiMaterialUpload(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('课件超过 20MB 限制')
    return false
  }
  return true
}

async function uploadCiMaterial(req) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'courseInstanceLessonMaterial' })
    if (!Array.isArray(ciMaterialsDraft.data.fileIds)) ciMaterialsDraft.data.fileIds = []
    ciMaterialsDraft.data.fileIds.push(data.id)
    ciMaterialNames.set(String(data.id), data.originalName || data.id)
    ElMessage.success('课件已上传,点"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function onPickCiMaterials(files) {
  if (!Array.isArray(ciMaterialsDraft.data.fileIds)) ciMaterialsDraft.data.fileIds = []
  const existing = new Set(ciMaterialsDraft.data.fileIds.map(String))
  for (const f of files) {
    const id = String(f._id)
    if (!existing.has(id)) {
      ciMaterialsDraft.data.fileIds.push(id)
      ciMaterialNames.set(id, f.originalName || id)
      existing.add(id)
    }
  }
}

// 取消弹窗
const cancelDialog = ref(false)
const cancelSaving = ref(false)
const cancelReason = ref('')

// 快捷报名弹窗(只对 enrolling 行可触发,开班锁定)
const enrollDialog = ref(false)
const enrollTarget = ref(null)

// 排课弹窗（从开班行点「排课」进入，CourseInstance 预选）
const scheduleDialog = ref(false)
const scheduleTarget = ref(null)
function openScheduleDialog(row) {
  if (row.status === 'closed' || row.status === 'cancelled') {
    ElMessage.warning('该状态的开班不可排课')
    return
  }
  scheduleTarget.value = row
  scheduleDialog.value = true
}

const nextStatusOptions = computed(() => STATUS_NEXT[statusForm.from] || [])

// 进入"进行中"的前置条件：
//   1) 已排满（与后端 service.setStatus 校验保持一致）
//   2) 至少 1 个有效报名（status='enrolled'）—— 没学生的开班不能进"进行中"
//   3) 所有报名学生都绑定了主用课包（enrollment.studentProduct 非空）
const canGoActive = computed(() => {
  const src = statusForm._source
  if (!src) return false
  const total = src.schedulePlan?.totalPlannedLessons || 0
  const scheduled = src.scheduledCount || 0
  const enrolled = src.enrolledCount || 0
  const noSp = src.enrollmentsWithoutSp || 0
  return total > 0 && scheduled >= total && enrolled > 0 && noSp === 0
})

// 各阻塞原因的具体文案已下沉到 targetBlockReason(target) 里,
// 用于在 el-option 标签后追加 "（原因）"。原本的 activeBlockReason 在弹窗下方单独
// 提示，已被内联展示替代，不再保留。

// 进入"已结班"的前置条件：开班下所有排课都已归档（与后端 service.setStatus 校验保持一致）
// scheduledCount 是全部排课数；archivedCount 由 detail 接口 / 客户端懒加载补齐
const notArchivedCount = computed(() => {
  const src = statusForm._source
  if (!src) return 0
  const total = src.scheduledCount || 0
  const archived = src.archivedCount || 0
  return Math.max(0, total - archived)
})
const canGoClosed = computed(() => {
  const src = statusForm._source
  if (!src) return false
  return (src.scheduledCount || 0) > 0 && notArchivedCount.value === 0
})

function isTargetDisabled(target) {
  // enrolling → active 受"必须排满"约束
  if (statusForm.from === 'enrolling' && target === 'active') {
    return !canGoActive.value
  }
  // active → closed 受"全部排课已归档"约束
  if (statusForm.from === 'active' && target === 'closed') {
    return !canGoClosed.value
  }
  return false
}

// 每个被禁用的目标状态对应的具体原因:
//   - 用于在 el-option 标签后追加 "（原因）" 让用户一眼看到为什么不能选
//   - 文案与后端 service.setStatus 的校验保持一致,避免前后端不一致导致误解
function targetBlockReason(target) {
  const src = statusForm._source
  if (!src) return ''
  // enrolling → active 的四种阻塞原因
  if (statusForm.from === 'enrolling' && target === 'active') {
    const total = src.schedulePlan?.totalPlannedLessons || 0
    const scheduled = src.scheduledCount || 0
    const enrolled = src.enrolledCount || 0
    const noSp = src.enrollmentsWithoutSp || 0
    if (total <= 0) return '排课计划未配置'
    if (scheduled < total) return `尚未排满（${scheduled} / ${total}）`
    if (enrolled === 0) return '该开班暂无学生报名'
    if (noSp > 0) return `${noSp} 名学生未绑定主用课包`
    return ''
  }
  // active → closed 的阻塞原因
  if (statusForm.from === 'active' && target === 'closed') {
    const n = notArchivedCount.value
    if (n > 0) return `还有 ${n} 节排课未归档`
    if ((src.scheduledCount || 0) === 0) return '开班下尚无排课'
    return ''
  }
  return ''
}

// 给 el-option 用的 label 渲染:
//   可用: 原 label
//   禁用: 原 label + "（原因）",原因用 muted 颜色展示,与后端文案保持一致
function targetOptionLabel(opt) {
  const reason = isTargetDisabled(opt.value) ? targetBlockReason(opt.value) : ''
  if (!reason) return opt.label
  return `${opt.label}（${reason}）`
}

const subjectOutOfProduct = computed(() => {
  if (!form.subject || !form.courseProduct) return false
  const p = products.value.find((x) => x._id === form.courseProduct)
  if (!p || !Array.isArray(p.subjects) || p.subjects.length === 0) return false
  return !p.subjects.map(String).includes(String(form.subject))
})

function statusLabel(s) { return STATUS_LABELS[s] || s }
function statusType(s) { return STATUS_TYPES[s] || '' }

// 列表行的「开班名 / 课程产品 / 老师」拼起来，用在弹窗标题
const transferSourceLabel = computed(() => {
  const src = statusForm._source
  if (!src) return ''
  const product = src.courseProduct && src.courseProduct.name
  const teacher = src.teacher && (src.teacher.realName || src.teacher.mobile)
  return `${product || '?'} · 老师 ${teacher || '-'}`
})

// 行操作权限
function canChangeStatus(row) {
  // 至少有下一步才能改
  return (STATUS_NEXT[row.status] || []).length > 0
}
function canCancel(row) {
  // 仅超管 + 非 cancelled
  return auth.isPlatformAdmin && row.status !== 'cancelled'
}
function canDelete(row) {
  // 仅超管 + 仅 planning/cancelled
  return auth.isPlatformAdmin && ['planning', 'cancelled'].includes(row.status)
}
// 已报人数是否达到/超过 maxStudents(maxStudents 缺省时不算超额)
// 注:capLevel() 已涵盖此判断,此处不再单独保留。

// 已报 / 上限 三档分级:low(< half) / mid(half~上限) / over(>= 上限) / none(无上限)
// 用于「已报 / 上限」单元格颜色区分:
//   low  → 蓝色 (报名偏少,有招生空间)
//   mid  → 绿色 (正常)
//   over → 红色 (超额,需分班)
function capLevel(row) {
  const enrolled = row.enrolledCount || 0
  const cap = row.maxStudents
  if (!cap) return 'none'
  if (enrolled >= cap) return 'over'
  if (enrolled >= cap / 2) return 'mid'
  return 'low'
}

function capTitle(row) {
  const lvl = capLevel(row)
  if (lvl === 'over') return '超额,需分班'
  if (lvl === 'mid') return '已达半数以上,可重点跟进'
  if (lvl === 'low') return '报名偏少,有招生空间'
  return '未设置上限'
}

// 排课进度状态：'none' = 0 / 'partial' = 0<x<total / 'full' = x==total
function scheduleState(row) {
  const total = row.schedulePlan?.totalPlannedLessons
  if (!total) return 'none'
  const scheduled = row.scheduledCount || 0
  if (scheduled <= 0) return 'none'
  if (scheduled >= total) return 'full'
  return 'partial'
}

function scheduleProgressClass(row) {
  const s = scheduleState(row)
  if (s === 'full') return 'progress-full'
  if (s === 'none') return 'progress-none'
  return 'progress-partial'
}

function openEnroll(row) {
  enrollTarget.value = row
  enrollDialog.value = true
}

// ─── 已报名学生列表弹窗 ───
// 点列表里「已报 / 上限」单元格触发:展示该开班下所有 CourseEnrollment(包含已结业/退班)。
// 只读视图,跳详情/调整班级等操作去「课程报名」页。
const enrolledDialog = ref(false)
const enrolledLoading = ref(false)
const enrolledList = ref([])
const enrolledTarget = ref(null)
const enrolledDialogTitle = computed(() => {
  const t = enrolledTarget.value
  if (!t) return '已报名学生'
  const name = t.name || (t.courseProduct && t.courseProduct.name) || '?'
  return `已报名学生 · ${name}`
})
const enrolledSummary = computed(() => {
  const t = enrolledTarget.value
  if (!t) return ''
  const enrolled = t.enrolledCount || 0
  const cap = t.maxStudents || '∞'
  return `已报 ${enrolled} / 上限 ${cap}`
})
const enrolledCapTagType = computed(() => {
  const lvl = capLevel(enrolledTarget.value || {})
  if (lvl === 'over') return 'danger'
  if (lvl === 'mid') return 'success'
  if (lvl === 'low') return 'primary'
  return 'info'
})

const ENROLL_STATUS_LABELS = {
  enrolled: '已报名',
  archived: '已归档',
  dropped: '教务退班',
  withdrew: '家长退班'
}
const ENROLL_STATUS_TYPES = {
  enrolled: 'success',
  archived: 'info',
  dropped: 'warning',
  withdrew: 'danger'
}
function enrollStatusLabel(s) { return ENROLL_STATUS_LABELS[s] || s || '—' }
function enrollStatusType(s) { return ENROLL_STATUS_TYPES[s] || '' }

async function openEnrolledList(row) {
  enrolledTarget.value = row
  enrolledList.value = []
  enrolledDialog.value = true
  enrolledLoading.value = true
  try {
    // 拉报名列表:不过滤状态,把已结业/退班也展示出来便于追溯。
    // pageSize=500 足够覆盖单开班上限(maxStudents 业务上很少超过这个量级)。
    const r = await courseEnrollmentApi.list({ courseInstance: row._id, pageSize: 500 })
    enrolledList.value = r.data?.items || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载报名列表失败')
    enrolledDialog.value = false
  } finally {
    enrolledLoading.value = false
  }
}

// ─── 详情抽屉 ───
const detailDrawer = ref(false)
const detailLoading = ref(false)
const detailRow = ref(null)
const detailSchedules = ref([])
const detailTitle = computed(() => {
  const r = detailRow.value
  if (!r) return '开班详情'
  return `开班详情 · ${r.name || (r.courseProduct && r.courseProduct.name) || '?'}`
})

async function openDetail(row) {
  detailRow.value = row
  detailSchedules.value = []
  detailDrawer.value = true
  detailLoading.value = true
  try {
    // 重新拉 detail（拿到最新 scheduledCount）和该开班的全部排课
    const [d, s] = await Promise.all([
      courseInstanceApi.detail(row._id),
      lessonScheduleApi.list({ courseInstance: row._id, pageSize: 500 })
    ])
    detailRow.value = d.data
    detailSchedules.value = s.data?.items || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

function goScheduleList() {
  if (!detailRow.value) return
  router.push({
    path: '/schedule',
    query: { courseInstance: detailRow.value._id }
  })
}

// ─── 加一节排课（单条） ───
const addLessonDialog = ref(false)
const addLessonTarget = ref(null)

function openAddLesson() {
  if (!detailRow.value) return
  // 重新拉一份最新 detail 进来（确保 scheduledCount 是最新的）
  addLessonTarget.value = detailRow.value
  addLessonDialog.value = true
}

async function onAddLessonDone() {
  // 重新拉详情，刷新进度 + 排课列表
  if (detailRow.value && detailRow.value._id) {
    await openDetail(detailRow.value)
  }
  // 同步主列表的 scheduledCount
  load()
}

async function load() {
  loading.value = true
  try {
    const params = {}
    if (filters.keyword) params.keyword = filters.keyword.trim()
    if (filters.subject) params.subject = filters.subject
    if (filters.teacher) params.teacher = filters.teacher
    if (filters.room) params.room = filters.room
    // statuses 多选用逗号串发；空数组表示"全部不选 → 后端返回空"
    params.statuses = filters.statuses.join(',')
    const r = await courseInstanceApi.list(params)
    list.value = r.data
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  // 重置时也要清掉搜索防抖的 pending
  if (keywordTimer) {
    clearTimeout(keywordTimer)
    keywordTimer = null
  }
  filters.keyword = ''
  filters.subject = ''
  filters.teacher = ''
  filters.room = ''
  filters.statuses = [...DEFAULT_STATUS_FILTER]
  load()
}

async function loadDeps() {
  const [t, u, rm, sub] = await Promise.all([
    courseProductApi.list(),
    userApi.list({ pageSize: 200 }),
    roomApi.list(),
    subjectApi.list()
  ])
  products.value = t.data
  teachers.value = u.data.items.filter((x) => x.positions.some((p) => p.name === '老师'))
  rooms.value = rm.data
  subjects.value = sub.data
}

function pickId(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v._id || v.id || ''
}

function resetForm() {
  Object.assign(form, {
    _id: null,
    subject: '',
    name: '',
    description: '',
    teacherIntro: '',
    courseProduct: '',
    teacher: '',
    room: '',
    schedulePlanPreset: 'spring-autumn',
    schedulePlan: defaultSchedulePlan(),
    startDate: '',
    maxStudents: 10,
    status: 'planning',
    // 2026-06: 教学体系特例(覆盖 Subject 快照来的 syllabus / lessonMaterials)
    syllabusOverride: { totalLessons: 0, lessons: [] },
    lessonMaterialsOverride: { items: [] }
  })
}

function openCreate() {
  resetForm()
  dialog.value = true
}

function onPresetChange(presetValue) {
  if (presetValue.startsWith('custom-')) return
  const preset = SCHEDULE_PRESETS.find((p) => p.value === presetValue)
  if (preset && preset.plan) {
    if (preset.plan.lessonsPerWeek != null) form.schedulePlan.lessonsPerWeek = preset.plan.lessonsPerWeek
    if (preset.plan.restDays) form.schedulePlan.restDays = [...preset.plan.restDays]
    if (preset.plan.cycleOnDays != null) form.schedulePlan.cycleOnDays = preset.plan.cycleOnDays
    if (preset.plan.cycleOffDays != null) form.schedulePlan.cycleOffDays = preset.plan.cycleOffDays
  }
}

function onModeChange() {
  // 切模式时把另一模式的字段清空，避免后端校验混乱
  if (form.schedulePlan.mode === 'weekly') {
    form.schedulePlan.cycleOnDays = null
    form.schedulePlan.cycleOffDays = null
    form.schedulePlanPreset = 'spring-autumn'
    onPresetChange('spring-autumn')
  } else if (form.schedulePlan.mode === 'cycle') {
    form.schedulePlan.lessonsPerWeek = null
    form.schedulePlan.restDays = []
    form.schedulePlanPreset = 'cycle-5on1off'
    onPresetChange('cycle-5on1off')
  }
}

function detectPresetFromPlan(plan) {
  const mode = plan.mode || 'weekly'
  for (const p of SCHEDULE_PRESETS) {
    if (p.mode !== mode) continue
    if (!p.plan) continue
    if (mode === 'cycle') {
      if (Number(p.plan.cycleOnDays) === Number(plan.cycleOnDays) &&
          Number(p.plan.cycleOffDays) === Number(plan.cycleOffDays)) {
        return p.value
      }
    } else {
      const planDays = [...(plan.restDays || [])].map(Number).sort()
      const presetDays = [...p.plan.restDays].map(Number).sort()
      if (Number(p.plan.lessonsPerWeek) === Number(plan.lessonsPerWeek) &&
          JSON.stringify(planDays) === JSON.stringify(presetDays)) {
        return p.value
      }
    }
  }
  return `custom-${mode}`
}

function onSchedulePlanManualEdit() {
  if (form.schedulePlanPreset && form.schedulePlanPreset.startsWith('custom-')) return
  form.schedulePlanPreset = detectPresetFromPlan(form.schedulePlan)
}

function openEdit(row) {
  form._id = row._id
  form.subject = pickId(row.subject)
  form.name = row.name || ''
  form.description = row.description || ''
  form.teacherIntro = row.teacherIntro || ''
  form.courseProduct = pickId(row.courseProduct)
  form.teacher = pickId(row.teacher)
  form.room = pickId(row.room)
  const plan = { ...defaultSchedulePlan(), ...(row.schedulePlan || {}) }
  if (!plan.mode) plan.mode = 'weekly'
  form.schedulePlan = plan
  form.schedulePlanPreset = detectPresetFromPlan(plan)
  form.startDate = row.startDate ? String(row.startDate).slice(0, 10) : ''
  form.maxStudents = row.maxStudents || 10
  form.status = row.status || 'planning'
  // 2026-06: 教学特例
  form.syllabusOverride = (row.syllabusOverride && row.syllabusOverride.lessons)
    ? {
        totalLessons: row.syllabusOverride.totalLessons || row.syllabusOverride.lessons.length,
        lessons: row.syllabusOverride.lessons.map((l) => ({
          lessonNo: l.lessonNo,
          topic: l.topic || '',
          description: l.description || '',
          objectives: Array.isArray(l.objectives) ? [...l.objectives] : [],
          durationMinutes: l.durationMinutes != null ? Number(l.durationMinutes) : null
        }))
      }
    : { totalLessons: 0, lessons: [] }
  form.lessonMaterialsOverride = (row.lessonMaterialsOverride && row.lessonMaterialsOverride.items)
    ? {
        items: row.lessonMaterialsOverride.items.map((it) => ({
          lessonNo: it.lessonNo,
          fileIds: (it.fileIds || []).map(String)
        }))
      }
    : { items: [] }
  // 快照信息(只读, 用来在 UI 上提示"已被快照的源")
  form._syllabusSnapshot = row.syllabusSnapshot || null
  form._lessonMaterialsSnapshot = row.lessonMaterialsSnapshot || null
  dialog.value = true
}

async function submit() {
  if (!form.subject) return ElMessage.warning('请选择教学科目')
  if (!form.courseProduct) return ElMessage.warning('请选择课程产品')
  if (!form.startDate) return ElMessage.warning('请选择开课日')
  if (!form.schedulePlan.totalPlannedLessons) return ElMessage.warning('请填写排课计划：总课次')
  // 按 mode 分支校验
  if (form.schedulePlan.mode === 'weekly') {
    if (!form.schedulePlan.lessonsPerWeek) return ElMessage.warning('请填写排课计划：每周课次')
    if (form.schedulePlan.totalPlannedLessons < form.schedulePlan.lessonsPerWeek) {
      return ElMessage.warning('总课次必须 >= 每周课次')
    }
  } else if (form.schedulePlan.mode === 'cycle') {
    if (!form.schedulePlan.cycleOnDays) return ElMessage.warning('cycle 模式：请填写"上几天"')
    if (!form.schedulePlan.cycleOffDays) return ElMessage.warning('cycle 模式：请填写"休几天"')
  }
  saving.value = true
  try {
    const payload = { ...form }
    delete payload._id
    delete payload.schedulePlanPreset
    if (!payload.subject) delete payload.subject
    if (!payload.teacher) delete payload.teacher
    if (!payload.room) delete payload.room
    // schedulePlan：按 mode 清空无用字段，避免后端校验报"字段互斥"
    if (payload.schedulePlan) {
      if (!payload.schedulePlan.minutesPerLesson) {
        delete payload.schedulePlan.minutesPerLesson
      }
      const mode = payload.schedulePlan.mode || 'weekly'
      if (mode === 'weekly') {
        delete payload.schedulePlan.cycleOnDays
        delete payload.schedulePlan.cycleOffDays
      } else if (mode === 'cycle') {
        delete payload.schedulePlan.lessonsPerWeek
        delete payload.schedulePlan.restDays
      }
    }
    if (form._id) {
      await courseInstanceApi.update(form._id, payload)
      ElMessage.success('已更新')
    } else {
      await courseInstanceApi.create(payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function openStatusDialog(row) {
  statusForm._source = row
  statusForm.from = row.status
  statusForm.toStatus = ''
  statusForm.reason = ''
  statusDialog.value = true
}

async function submitStatus() {
  if (!statusForm.toStatus) return ElMessage.warning('请选择目标状态')
  if (!statusForm.reason.trim()) return ElMessage.warning('请填写原因')
  statusSaving.value = true
  try {
    await courseInstanceApi.setStatus(statusForm._source._id, {
      toStatus: statusForm.toStatus,
      reason: statusForm.reason.trim()
    })
    ElMessage.success('状态已更新')
    statusDialog.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '更新失败')
  } finally {
    statusSaving.value = false
  }
}

function openCancelDialog(row) {
  statusForm._source = row
  cancelReason.value = ''
  cancelDialog.value = true
}

async function submitCancel() {
  if (!cancelReason.value.trim()) return ElMessage.warning('请填写原因')
  cancelSaving.value = true
  try {
    await courseInstanceApi.setStatus(statusForm._source._id, {
      toStatus: 'cancelled',
      reason: cancelReason.value.trim()
    })
    ElMessage.success('已取消开班')
    cancelDialog.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '取消失败')
  } finally {
    cancelSaving.value = false
  }
}

async function onDeleteConfirm(row, { password }) {
  try {
    await courseInstanceApi.remove(row._id, { password })
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `开班 ${row.name || row.courseProduct?.name || '?'}`)
  }
}

// ─── 状态流转历史 ───
// 点列表里的状态 tag 触发。复用 courseInstanceApi.detail（已 populate statusLog.by）。
// 不在 list 接口里返回 statusLog 是为了保持列表响应轻量 —— 历史是按需查看的次要信息。
const historyDialog = ref(false)
const historyLoading = ref(false)
const historyRow = ref(null)
const historyLog = ref([])

const historySourceLabel = computed(() => {
  const r = historyRow.value
  if (!r) return ''
  return r.name || (r.courseProduct && r.courseProduct.name) || '?'
})

function operatorName(by) {
  // by 是 detail 接口里 populate 出来的 User 子文档(或 ObjectId 字符串)
  if (!by) return '系统/未知'
  if (typeof by === 'string') return by.slice(-6)
  return by.realName || by.mobile || (by._id ? String(by._id).slice(-6) : '系统/未知')
}

async function openHistory(row) {
  historyRow.value = row
  historyLog.value = []
  historyDialog.value = true
  historyLoading.value = true
  try {
    const r = await courseInstanceApi.detail(row._id)
    historyRow.value = r.data
    // 按时间倒序：最近一次变更在最上面
    const log = Array.isArray(r.data.statusLog) ? [...r.data.statusLog] : []
    log.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    historyLog.value = log
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载历史失败')
    historyDialog.value = false
  } finally {
    historyLoading.value = false
  }
}

onMounted(() => {
  load()
  loadDeps()
})
</script>

<style scoped>
.course-instances-page { display: flex; flex-direction: column; gap: 12px; }
.header-card,
.filter-card { border: none; }
.filter-card :deep(.el-form-item) { margin-bottom: 0; }
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.title { margin: 0 0 4px 0; font-size: 20px; }
.subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }

.cell-strong { font-weight: 600; color: #303133; }
.cell-link { cursor: pointer; color: #409EFF; }
.cell-link:hover { text-decoration: underline; }
.muted { color: #909399; font-size: 12px; }
.over-cap { color: #f56c6c; font-weight: 600; }

/* ── 已报 / 上限 单元格 ──
   三档颜色:低(<一半)=蓝、正常(>=一半)=绿、超额(>=上限)=红。
   整格可点击 -> 弹出该开班的报名学生列表;
   cursor + hover 反馈让"可点"这件事一眼可见。 */
.cap-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  transition: filter 0.15s, transform 0.1s;
}
.cap-cell:hover { filter: brightness(0.92); }
.cap-cell:active { transform: scale(0.97); }
.cap-cell .cap-arrow {
  font-size: 10px;
  opacity: 0.7;
}
.cap-cell.cap-low {
  color: #409EFF;
  background: rgba(64, 158, 255, 0.1);
}
.cap-cell.cap-mid {
  color: #67c23a;
  background: rgba(103, 194, 58, 0.1);
}
.cap-cell.cap-over {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.12);
}
.cap-cell.cap-none {
  color: #909399;
  background: rgba(144, 147, 153, 0.08);
}

/* ── 已报名学生弹窗 ── */
.enrolled-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

/* ── 上课进度单元格 ──
   三段数字:已结束 / 已归档 / 总数。
   已结束 用主色,已归档 用灰色弱化(因为归档是完成后的进阶态),总数 加粗。
   这样视觉权重自然落在"已结束"上——那才是机构当下最关心的指标。 */
.class-progress {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: 13px;
  line-height: 1.2;
}
.class-progress .cp-num {
  color: #409EFF;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.class-progress .cp-num:nth-of-type(2) {
  color: #909399;
  font-weight: 500;
}
.class-progress .cp-total {
  color: #303133;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.class-progress .cp-sep {
  color: #c0c4cc;
  margin: 0 2px;
  font-weight: 400;
}
.schedule-progress { margin-top: 4px; display: flex; align-items: center; font-size: 12px; }
.schedule-progress .progress-full { color: #67c23a; font-weight: 600; }
.schedule-progress .progress-partial { color: #E6A23C; font-weight: 600; }
.schedule-progress .progress-none { color: #f56c6c; font-weight: 600; }
.muted-warn { color: #f56c6c; font-size: 12px; margin-top: 2px; }
.hint-warn {
  color: #E6A23C;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 4px;
}
.form-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}
.readonly-value {
  font-size: 14px;
  color: #303133;
}

/* ── 状态 tag 可点击样式 ──
   与「改状态」按钮的职责区分:这里是只读查看历史(看过去),按钮是主动变更(改未来)。
   cursor + hover + 小图标三件套,告诉用户"这玩意儿能点"。 */
.status-clickable {
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
}
.status-clickable:hover { opacity: 0.78; }
.status-clickable:active { opacity: 0.6; }
.status-hint {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.7;
  font-weight: normal;
}

/* ── 状态流转历史弹窗 ── */
.history-current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
}
.history-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.history-line .arrow {
  color: #909399;
  font-size: 12px;
}
.history-reason,
.history-by {
  font-size: 13px;
  color: #303133;
  margin-top: 2px;
  line-height: 1.6;
}

/* ── 详情抽屉 ── */
.detail-content { display: flex; flex-direction: column; gap: 12px; }
.detail-card { border: none; }
.detail-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.detail-progress-text { font-size: 14px; }
.card-title { font-weight: 600; }
.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
