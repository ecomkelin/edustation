<template>
  <div class="page">
    <h2>学科</h2>
    <p class="hint">
      机构的学科。一个学科对应一个**细分到教学粒度**的课程类目（如"python 初级" / "python 高级"），
      携带教学大纲 + 每堂课课件。课程产品只承载"售卖规格"（价格 / 课时 / 有效期），不再含教学大纲。
    </p>

    <el-space style="margin-bottom: 12px">
      <el-input
        v-model="keyword"
        placeholder="按名称搜索"
        clearable
        style="width: 200px"
        @keyup.enter="load"
        @clear="load"
      />
      <el-button @click="load">搜索</el-button>
      <el-button type="primary" @click="openCreate">新建学科</el-button>
      <!-- 跨机构同步: 仅平台超管可见/可点。非超管连入口都没有, 不会发 listSourceOrgs / listByOrg / sync 请求 -->
      <template v-if="auth.isPlatformAdmin">
        <el-tooltip
          :disabled="!!auth.currentOrgId"
          content="请先在顶部「机构切换」中选择一个目标机构"
          placement="top"
        >
          <el-button
            :disabled="!auth.currentOrgId"
            @click="openSync"
          >从其他机构同步学科</el-button>
        </el-tooltip>
      </template>
    </el-space>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="分类" min-width="140">
        <template #default="{ row }">
          <span v-if="row.category">{{ row.category.name }}</span>
          <el-tag v-else type="info" size="small">未分类</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="大纲节数" width="100">
        <template #default="{ row }">
          <span style="color: #606266">
            {{ (row.syllabus && row.syllabus.lessons && row.syllabus.lessons.length) || 0 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="课件组数" width="100">
        <template #default="{ row }">
          <span style="color: #606266">
            {{ (row.lessonMaterials && row.lessonMaterials.items && row.lessonMaterials.items.length) || 0 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="教学目标" min-width="200">
        <template #default="{ row }">
          <template v-if="row.objectives && row.objectives.length">
            <el-tag v-for="(o, i) in row.objectives.slice(0, 3)" :key="i" size="small" style="margin-right: 4px">
              {{ o }}
            </el-tag>
            <el-tag v-if="row.objectives.length > 3" type="info" size="small">
              +{{ row.objectives.length - 3 }}
            </el-tag>
          </template>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="海报" width="80">
        <template #default="{ row }">
          <el-image
            v-if="row.posterFileId && row.posterFileId.url"
            :src="row.posterFileId.url"
            :preview-src-list="[row.posterFileId.url]"
            fit="cover"
            style="width: 48px; height: 48px; border-radius: 4px"
            :hide-on-click-modal="true"
          />
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <!-- 「误操删除」:仅平台超管可见;走二次确认 + 输密码;无 CourseProduct/CourseInstance 引用才能删 -->
          <DestructiveConfirm
            v-if="isPlatformAdmin"
            :target="`学科 ${row.name}`"
            warning="中风险"
            :precheck-notes="['该学科不被任何课程产品引用', '该学科不被任何开班作为主学科']"
            :precheck="() => subjectApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger">误操删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialog"
      :title="form.id ? '编辑学科' : '新建学科'"
      width="1100px"
      :before-close="onSubjectDialogBeforeClose"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <!-- 基本信息 -->
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="分类">
          <el-tree-select
            v-model="form.category"
            :data="categoryTree"
            :props="{ value: 'id', label: 'name', children: 'children' }"
            check-strictly
            clearable
            placeholder="不选则不分类"
            style="width: 100%"
          />
          <span class="form-tip">类别需先在「类别字典 - 学科」下维护</span>
        </el-form-item>
        <el-form-item label="教学目标">
          <div class="obj-list">
            <div v-for="(o, i) in form.objectives" :key="i" class="obj-row">
              <el-input v-model="form.objectives[i]" maxlength="200" placeholder="如：掌握基础乐理" />
              <el-button link type="danger" :icon="Delete" @click="form.objectives.splice(i, 1)" />
            </div>
            <el-button :icon="Plus" size="small" @click="form.objectives.push('')">添加目标</el-button>
          </div>
        </el-form-item>
        <el-form-item label="海报">
          <div class="media-row">
            <div v-if="form.posterFileId" class="media-preview">
              <el-image
                :src="form.posterFileId.url"
                fit="cover"
                style="width: 120px; height: 80px; border-radius: 4px"
                :preview-src-list="[form.posterFileId.url]"
                :hide-on-click-modal="true"
              />
              <div class="media-meta">
                <span class="text-12">{{ form.posterFileId.originalName || '已选海报' }}</span>
                <el-button link size="small" type="danger" @click="form.posterFileId = null">移除</el-button>
              </div>
            </div>
            <div v-else class="media-empty">
              <el-icon :size="28" color="#c0c4cc"><Picture /></el-icon>
              <span class="text-12 muted">未上传海报</span>
            </div>
            <div class="media-actions">
              <el-upload
                :show-file-list="false"
                :auto-upload="true"
                :http-request="(req) => uploadMedia(req, 'poster')"
                :before-upload="beforePosterUpload"
                accept="image/*"
              >
                <el-button :icon="Upload" size="small">上传新海报</el-button>
              </el-upload>
              <el-button :icon="Folder" size="small" @click="openPicker('poster')">从文件库选</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="宣传视频">
          <div class="media-row">
            <div v-if="form.videoFileId" class="media-preview">
              <video
                :src="form.videoFileId.url"
                style="width: 160px; height: 90px; border-radius: 4px; background: #000"
                controls
              />
              <div class="media-meta">
                <span class="text-12">{{ form.videoFileId.originalName || '已选视频' }}</span>
                <el-button link size="small" type="danger" @click="form.videoFileId = null">移除</el-button>
              </div>
            </div>
            <div v-else class="media-empty">
              <el-icon :size="28" color="#c0c4cc"><VideoCamera /></el-icon>
              <span class="text-12 muted">未上传宣传视频</span>
            </div>
            <div class="media-actions">
              <el-upload
                :show-file-list="false"
                :auto-upload="true"
                :http-request="(req) => uploadMedia(req, 'video')"
                :before-upload="beforeVideoUpload"
                accept="video/*"
              >
                <el-button :icon="Upload" size="small">上传新视频</el-button>
              </el-upload>
              <el-button :icon="Folder" size="small" @click="openPicker('video')">从文件库选</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="课程简介">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="富文本内容（当前使用纯文本，后续可接编辑器）"
          />
        </el-form-item>

        <!-- ── 教学大纲(2026-06 拆出来) ── -->
        <el-divider content-position="left">
          <span style="font-weight: 600">教学大纲</span>
          <span style="color: #909399; font-weight: normal; margin-left: 6px">
            ({{ syllabusLessons.length }} 节)
          </span>
        </el-divider>
        <el-form-item label="">
          <div style="width: 100%">
            <div class="tab-toolbar">
              <el-button :icon="Plus" size="small" type="primary" @click="openSyllabusLessonDialog()">添加课时</el-button>
              <span class="form-tip">按 lessonNo 1..N 描述每节课；同一学科的 lessonNo 唯一</span>
            </div>
            <el-table v-if="syllabusLessons.length" :data="syllabusLessons" border size="small">
              <el-table-column prop="lessonNo" label="课次" width="70" />
              <el-table-column prop="topic" label="主题" min-width="160" show-overflow-tooltip />
              <el-table-column label="内容" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <span style="color: #606266; font-size: 12px">{{ row.description || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="目标" min-width="140" show-overflow-tooltip>
                <template #default="{ row }">
                  <template v-if="row.objectives && row.objectives.length">
                    <el-tag v-for="(o, i) in row.objectives.slice(0, 2)" :key="i" size="small" style="margin-right: 4px">{{ o }}</el-tag>
                    <el-tag v-if="row.objectives.length > 2" type="info" size="small">+{{ row.objectives.length - 2 }}</el-tag>
                  </template>
                  <span v-else class="muted">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="durationMinutes" label="时长(分)" width="90">
                <template #default="{ row }">
                  <span>{{ row.durationMinutes || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row, $index }">
                  <el-button size="small" link type="primary" @click="openSyllabusLessonDialog($index)">编辑</el-button>
                  <el-button size="small" link type="danger" @click="removeSyllabusLesson($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无教学大纲，点击「添加课时」开始配置" :image-size="60" />
          </div>
        </el-form-item>

        <!-- ── 每堂课课件 ── -->
        <el-divider content-position="left">
          <span style="font-weight: 600">每堂课课件</span>
          <span style="color: #909399; font-weight: normal; margin-left: 6px">
            ({{ lessonMaterialItems.length }} 组)
          </span>
        </el-divider>
        <el-form-item label="">
          <div style="width: 100%">
            <div class="tab-toolbar">
              <el-button :icon="Plus" size="small" type="primary" @click="openMaterialItemDialog()">添加课件组</el-button>
              <span class="form-tip">按 lessonNo 归类本节课的课件；lessonNo 需与教学大纲对应</span>
            </div>
            <el-table v-if="lessonMaterialItems.length" :data="lessonMaterialItems" border size="small">
              <el-table-column prop="lessonNo" label="课次" width="70" />
              <el-table-column label="课件数" width="80">
                <template #default="{ row }">
                  <span style="color: #606266">{{ (row.fileIds || []).length }}</span>
                </template>
              </el-table-column>
              <el-table-column label="文件" min-width="320">
                <template #default="{ row }">
                  <template v-if="row.fileIds && row.fileIds.length">
                    <el-tag
                      v-for="(fid, i) in row.fileIds.slice(0, 3)"
                      :key="fid"
                      size="small"
                      style="margin-right: 4px; margin-bottom: 4px"
                    >{{ materialName(fid) }}</el-tag>
                    <el-tag v-if="row.fileIds.length > 3" type="info" size="small">+{{ row.fileIds.length - 3 }}</el-tag>
                  </template>
                  <span v-else class="muted">未上传</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row, $index }">
                  <el-button size="small" link type="primary" @click="openMaterialItemDialog($index)">编辑</el-button>
                  <el-button size="small" link type="danger" @click="removeMaterialItem($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无课件，点击「添加课件组」上传" :image-size="60" />
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 教学大纲单节编辑弹窗 -->
    <el-dialog
      v-model="syllabusLessonDialog"
      :title="syllabusLessonDraft.idx === null ? '新增课时' : '编辑课时'"
      width="640px"
      :close-on-click-modal="false"
      :before-close="onSyllabusLessonBeforeClose"
      append-to-body
    >
      <el-form :model="syllabusLessonDraft.data" label-width="100px">
        <el-form-item label="课次" required>
          <el-input-number v-model="syllabusLessonDraft.data.lessonNo" :min="1" :max="999" :step="1" />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="syllabusLessonDraft.data.topic" maxlength="100" />
        </el-form-item>
        <el-form-item label="时长(分)">
          <el-input-number v-model="syllabusLessonDraft.data.durationMinutes" :min="1" :max="600" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="syllabusLessonDraft.data.description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="目标">
          <div class="obj-list">
            <div v-for="(o, i) in syllabusLessonDraft.data.objectives" :key="i" class="obj-row">
              <el-input v-model="syllabusLessonDraft.data.objectives[i]" maxlength="200" />
              <el-button link type="danger" :icon="Delete" @click="syllabusLessonDraft.data.objectives.splice(i, 1)" />
            </div>
            <el-button :icon="Plus" size="small" @click="syllabusLessonDraft.data.objectives.push('')">添加目标</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="syllabusLessonDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmSyllabusLesson">确定</el-button>
      </template>
    </el-dialog>

    <!-- 课件组编辑弹窗 -->
    <el-dialog
      v-model="materialItemDialog"
      :title="materialItemDraft.idx === null ? '新增课件组' : '编辑课件组'"
      width="640px"
      :close-on-click-modal="false"
      :before-close="onMaterialItemBeforeClose"
      append-to-body
    >
      <el-form :model="materialItemDraft.data" label-width="100px">
        <el-form-item label="课次" required>
          <el-input-number v-model="materialItemDraft.data.lessonNo" :min="1" :max="999" :step="1" />
        </el-form-item>
        <el-form-item label="课件文件">
          <div class="materials">
            <div v-for="(fid, i) in materialItemDraft.data.fileIds" :key="fid" class="material-chip">
              <el-icon style="margin-right: 4px"><Document /></el-icon>
              <span class="text-12">{{ materialName(fid) }}</span>
              <el-button link size="small" type="danger" @click="materialItemDraft.data.fileIds.splice(i, 1)">移除</el-button>
            </div>
            <el-upload
              :show-file-list="false"
              :auto-upload="true"
              :http-request="uploadMaterialInDialog"
              :before-upload="beforeMaterialUpload"
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            >
              <el-button :icon="Upload" size="small">上传新课件</el-button>
            </el-upload>
            <el-button :icon="Folder" size="small" link @click="materialPicker = true">从文件库选</el-button>
          </div>
          <div class="form-tip">支持图片 / 视频 / 音频 / PDF / Office 文件</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="materialItemDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmMaterialItem">确定</el-button>
      </template>
    </el-dialog>

    <!-- 跨机构同步弹窗（仅平台超管） -->
    <el-dialog
      v-model="syncDialog"
      title="从其他机构同步学科"
      width="820px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="同步规则"
        description="仅复制与本公司不同名的学科。同名学科会被自动跳过，不会覆盖也不会报错。category / objectives / description / 教学大纲(文本) 一并复制；海报 / 视频 / 课件 fileId 因跨机构会失效，会复制骨架并清空 fileIds, 用户后续在目标机构重新上传。"
        style="margin-bottom: 12px"
      />

      <div class="target-org-bar">
        <span class="label">目标机构：</span>
        <span class="value">{{ currentOrgName || '（未选择）' }}</span>
        <el-tag v-if="currentOrgName" type="info" size="small">
          同步到此
        </el-tag>
      </div>

      <el-form label-width="80px" style="margin-top: 8px">
        <el-form-item label="源机构">
          <el-select
            v-model="selectedSourceOrgId"
            filterable
            remote
            :remote-method="searchSourceOrgs"
            :loading="sourceOrgsLoading"
            placeholder="搜索源机构（名称 / 简称 / 信用代码）"
            style="width: 100%"
            @change="onSourceOrgChange"
          >
            <el-option
              v-for="o in sourceOrgs"
              :key="o._id"
              :value="o._id"
              :label="`${o.name}${o.nameAbbreviation ? '（' + o.nameAbbreviation + '）' : ''}`"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <el-table
        v-if="selectedSourceOrgId"
        ref="syncTableRef"
        :data="sourceSubjects"
        v-loading="sourceSubjectsLoading"
        border
        @selection-change="onSelectionChange"
        empty-text="该源机构下暂无学科"
        max-height="420"
      >
        <el-table-column
          type="selection"
          width="48"
          :selectable="(row) => !row.existsInCurrent"
        />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="大纲节数" width="100">
          <template #default="{ row }">
            <span style="color: #606266">
              {{ (row.syllabus && row.syllabus.lessons && row.syllabus.lessons.length) || 0 }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="分类" min-width="120">
          <template #default="{ row }">
            <span v-if="row.category">{{ row.category.name }}</span>
            <el-tag v-else type="info" size="small">未分类</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="教学目标" width="100">
          <template #default="{ row }">
            <span style="color: #606266">{{ (row.objectives || []).length }} 项</span>
          </template>
        </el-table-column>
        <el-table-column label="海报" width="80">
          <template #default="{ row }">
            <el-image
              v-if="row.posterFileId && row.posterFileId.url"
              :src="row.posterFileId.url"
              :preview-src-list="[row.posterFileId.url]"
              fit="cover"
              style="width: 40px; height: 40px; border-radius: 4px"
              :hide-on-click-modal="true"
            />
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default="{ row }">
            <el-tag v-if="row.existsInCurrent" type="warning" size="small">
              已存在，将跳过
            </el-tag>
            <el-tag v-else type="success" size="small">可同步</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="selectedSourceOrgId" class="sync-summary">
        已选 <b>{{ selectedSubjectIds.length }}</b> 个可同步；
        <span style="color: #909399">
          源机构共 {{ sourceSubjects.length }} 个，其中
          {{ sourceSubjects.filter((s) => s.existsInCurrent).length }} 个与本公司同名将被跳过
        </span>
      </div>

      <template #footer>
        <el-button @click="syncDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="syncing"
          :disabled="!selectedSubjectIds.length"
          @click="confirmSync"
        >
          同步 {{ selectedSubjectIds.length }} 个学科
        </el-button>
      </template>
    </el-dialog>

    <!-- 课件文件选择器(从文件库选) -->
    <FilePicker
      v-model="materialPicker"
      multiple
      scope="subjectLessonMaterial"
      title="选择课件文件"
      @select="onPickMaterials"
    />

    <!-- 海报 / 视频文件选择器(单选) -->
    <FilePicker
      v-model="mediaPicker"
      :scope="mediaPickerScope"
      :title="mediaPickerTitle"
      :mime-prefix="mediaPickerMimePrefix"
      @select="onPickMedia"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Document, Folder, Upload, Picture, VideoCamera } from '@element-plus/icons-vue'
import { subjectApi } from '@/api/subject'
import { storageApi } from '@/api/storage'
import { handleRemoveError } from '@/utils/removable'
import { categoryApi } from '@/api/category'
import { useAuthStore } from '@/stores/auth'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import FilePicker from '@/components/FilePicker.vue'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const list = ref([])
const loading = ref(false)
const keyword = ref('')
const categoryTree = ref([])

const dialog = ref(false)
const saving = ref(false)
const formRef = ref()
const form = reactive(emptyForm())

function emptyForm() {
  return {
    id: '',
    name: '',
    category: null,
    objectives: [],
    posterFileId: null,
    videoFileId: null,
    description: '',
    // 2026-06: 教学体系(教学大纲 + 课件)
    syllabus: { totalLessons: 0, lessons: [] },
    lessonMaterials: { items: [] }
  }
}

const rules = {
  name: [{ required: true, message: '请填写名称', trigger: 'blur' }]
}

const syllabusLessons = computed(() => (form.syllabus && form.syllabus.lessons) || [])
const lessonMaterialItems = computed(() => (form.lessonMaterials && form.lessonMaterials.items) || [])

async function load() {
  loading.value = true
  try {
    const r = await subjectApi.list({ keyword: keyword.value })
    list.value = (r.data || []).map((s) => ({ ...s, id: s.id || s._id }))
  } catch (e) {
    // 拦截器已 toast 业务错误, 这里只在 console 留底方便排查
    // eslint-disable-next-line no-console
    console.error('[subjects.load] failed:', e?.response?.data || e)
    list.value = []
  } finally {
    loading.value = false
  }
}

async function loadCategoryTree() {
  const r = await categoryApi.tree({ model: 'Subject' })
  categoryTree.value = r.data || []
}

function resetForm() {
  Object.assign(form, emptyForm())
  formRef.value?.clearValidate()
  // 清理课件名称缓存
  materialNames.clear()
}

function openCreate() {
  resetForm()
  dialog.value = true
  loadCategoryTree()
  takeSnapshot()
}

// 「原始值」快照:在 openCreate / openEdit 时记录;对比 form 当前值判断是否脏
const initialSnapshot = ref('')

function takeSnapshot() {
  // 拍扁 form 所有字段,作为「未修改」基线
  initialSnapshot.value = JSON.stringify({
    id: form.id,
    name: form.name,
    category: form.category,
    objectives: form.objectives,
    posterFileId: form.posterFileId,
    videoFileId: form.videoFileId,
    description: form.description,
    syllabus: form.syllabus,
    lessonMaterials: form.lessonMaterials
  })
}

function isSubjectDirty() {
  if (!initialSnapshot.value) return false
  const current = JSON.stringify({
    id: form.id,
    name: form.name,
    category: form.category,
    objectives: form.objectives,
    posterFileId: form.posterFileId,
    videoFileId: form.videoFileId,
    description: form.description,
    syllabus: form.syllabus,
    lessonMaterials: form.lessonMaterials
  })
  return current !== initialSnapshot.value
}

async function onSubjectDialogBeforeClose(done) {
  if (!isSubjectDirty()) {
    done()
    return
  }
  try {
    await ElMessageBox.confirm(
      '当前编辑的学科有未保存的修改(名称 / 大纲 / 课件等),关闭后不会保存。确定要关闭吗?',
      '有未保存的修改',
      { type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }
    )
    done()
  } catch {
    // 选「继续编辑」,不关
  }
}

function openEdit(row) {
  resetForm()
  Object.assign(form, {
    id: row.id || row._id,
    name: row.name,
    category: row.category ? row.category.id || row.category._id : null,
    objectives: Array.isArray(row.objectives) ? [...row.objectives] : [],
    // 后端 populate 出来可能是 { _id, url, originalName, mime } 或 null
    posterFileId: row.posterFileId
      ? { _id: String(row.posterFileId._id || row.posterFileId), url: row.posterFileId.url, originalName: row.posterFileId.originalName }
      : null,
    videoFileId: row.videoFileId
      ? { _id: String(row.videoFileId._id || row.videoFileId), url: row.videoFileId.url, originalName: row.videoFileId.originalName }
      : null,
    description: row.description || '',
    syllabus: row.syllabus && row.syllabus.lessons
      ? { totalLessons: row.syllabus.totalLessons || row.syllabus.lessons.length, lessons: row.syllabus.lessons.map((l) => ({ ...l, objectives: Array.isArray(l.objectives) ? [...l.objectives] : [] })) }
      : { totalLessons: 0, lessons: [] },
    lessonMaterials: row.lessonMaterials && row.lessonMaterials.items
      ? { items: row.lessonMaterials.items.map((it) => ({ lessonNo: it.lessonNo, fileIds: (it.fileIds || []).map(String) })) }
      : { items: [] }
  })
  // 预热课件名称缓存
  for (const it of form.lessonMaterials.items) {
    for (const fid of it.fileIds) {
      // 名称会在后端 detail 中通过 populate 给出,这里给个占位
      materialNames.set(String(fid), String(fid).slice(-6))
    }
  }
  dialog.value = true
  loadCategoryTree()
  takeSnapshot()
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  saving.value = true
  try {
    // 过滤空目标
    const objectives = (form.objectives || []).map((o) => (o || '').trim()).filter(Boolean)
    // 清理 syllabus 内的空字段 + lessonNo 校验
    const lessons = (form.syllabus.lessons || [])
      .filter((l) => l && Number.isInteger(l.lessonNo) && l.lessonNo >= 1)
      .map((l) => ({
        lessonNo: l.lessonNo,
        topic: (l.topic || '').trim(),
        description: l.description || '',
        objectives: (l.objectives || []).map((o) => (o || '').trim()).filter(Boolean),
        durationMinutes: l.durationMinutes != null && l.durationMinutes > 0 ? Number(l.durationMinutes) : null
      }))
      .sort((a, b) => a.lessonNo - b.lessonNo)
    // 课件项: lessonNo 必填, fileIds 数组可能为空
    const items = (form.lessonMaterials.items || [])
      .filter((it) => it && Number.isInteger(it.lessonNo) && it.lessonNo >= 1)
      .map((it) => ({
        lessonNo: it.lessonNo,
        fileIds: (it.fileIds || []).filter((x) => x != null).map((x) => String(x))
      }))
      .sort((a, b) => a.lessonNo - b.lessonNo)
    const payload = {
      name: form.name,
      category: form.category || null,
      objectives,
      posterFileId: form.posterFileId ? (form.posterFileId._id || form.posterFileId) : null,
      videoFileId: form.videoFileId ? (form.videoFileId._id || form.videoFileId) : null,
      description: form.description || '',
      syllabus: { totalLessons: lessons.length, lessons },
      lessonMaterials: { items }
    }
    if (form.id) {
      await subjectApi.update(form.id, payload)
      ElMessage.success('已更新')
    } else {
      await subjectApi.create(payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onRemoveConfirm(row, { password }) {
  try {
    await subjectApi.remove(row.id || row._id, { password })
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', `学科 ${row.name}`)
  }
}

/* ----- 教学大纲单节编辑 ----- */
const syllabusLessonDialog = ref(false)
const syllabusLessonDraft = reactive({ idx: null, data: { lessonNo: 1, topic: '', description: '', objectives: [], durationMinutes: null } })
const syllabusLessonSnapshot = ref('') // 「未修改」基线,关闭弹窗时比对

function emptySyllabusLessonDraft() {
  return { lessonNo: 1, topic: '', description: '', objectives: [], durationMinutes: null }
}

function openSyllabusLessonDialog(idx) {
  if (idx == null) {
    syllabusLessonDraft.idx = null
    Object.assign(syllabusLessonDraft.data, emptySyllabusLessonDraft())
  } else {
    const src = form.syllabus.lessons[idx]
    syllabusLessonDraft.idx = idx
    Object.assign(syllabusLessonDraft.data, {
      lessonNo: src.lessonNo,
      topic: src.topic || '',
      description: src.description || '',
      objectives: Array.isArray(src.objectives) ? [...src.objectives] : [],
      durationMinutes: src.durationMinutes != null ? Number(src.durationMinutes) : null
    })
  }
  syllabusLessonSnapshot.value = JSON.stringify(syllabusLessonDraft.data)
  syllabusLessonDialog.value = true
}

function confirmSyllabusLesson() {
  const draft = syllabusLessonDraft.data
  const cleaned = {
    lessonNo: Number(draft.lessonNo),
    topic: (draft.topic || '').trim(),
    description: draft.description || '',
    objectives: (draft.objectives || []).map((o) => (o || '').trim()).filter(Boolean),
    durationMinutes: draft.durationMinutes != null && draft.durationMinutes > 0 ? Number(draft.durationMinutes) : null
  }
  if (syllabusLessonDraft.idx == null) {
    // 新增: 防 lessonNo 重复
    if (form.syllabus.lessons.some((l) => l.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课已存在，请修改课次`)
    }
    form.syllabus.lessons.push(cleaned)
  } else {
    // 编辑: 允许保持原 lessonNo; 若改了, 防与别的 lessonNo 撞
    const oldNo = form.syllabus.lessons[syllabusLessonDraft.idx].lessonNo
    if (oldNo !== cleaned.lessonNo && form.syllabus.lessons.some((l) => l.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课已存在，请修改课次`)
    }
    form.syllabus.lessons.splice(syllabusLessonDraft.idx, 1, cleaned)
  }
  form.syllabus.lessons.sort((a, b) => a.lessonNo - b.lessonNo)
  syllabusLessonSnapshot.value = '' // 已确认,清掉基线
  syllabusLessonDialog.value = false
}

async function onSyllabusLessonBeforeClose(done) {
  if (!syllabusLessonSnapshot.value) {
    done()
    return
  }
  const cur = JSON.stringify(syllabusLessonDraft.data)
  if (cur === syllabusLessonSnapshot.value) {
    // 无改动
    syllabusLessonSnapshot.value = ''
    done()
    return
  }
  try {
    await ElMessageBox.confirm(
      '当前课时有未保存的修改,关闭后不会保存。确定要关闭吗?',
      '有未保存的修改',
      { type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }
    )
    syllabusLessonSnapshot.value = ''
    done()
  } catch {
    // 继续编辑
  }
}

function removeSyllabusLesson(idx) {
  form.syllabus.lessons.splice(idx, 1)
}

/* ----- 课件组编辑 ----- */
const materialItemDialog = ref(false)
const materialItemDraft = reactive({ idx: null, data: { lessonNo: 1, fileIds: [] } })
const materialItemSnapshot = ref('') // 「未修改」基线
const materialPicker = ref(false)
const materialNames = reactive(new Map())
function materialName(id) {
  return materialNames.get(String(id)) || String(id).slice(-6)
}

function emptyMaterialItemDraft() {
  return { lessonNo: 1, fileIds: [] }
}

function openMaterialItemDialog(idx) {
  if (idx == null) {
    materialItemDraft.idx = null
    Object.assign(materialItemDraft.data, emptyMaterialItemDraft())
  } else {
    const src = form.lessonMaterials.items[idx]
    materialItemDraft.idx = idx
    Object.assign(materialItemDraft.data, {
      lessonNo: src.lessonNo,
      fileIds: (src.fileIds || []).map(String)
    })
  }
  materialItemSnapshot.value = JSON.stringify(materialItemDraft.data)
  materialItemDialog.value = true
}

function confirmMaterialItem() {
  const draft = materialItemDraft.data
  const cleaned = {
    lessonNo: Number(draft.lessonNo),
    fileIds: (draft.fileIds || []).filter((x) => x != null).map((x) => String(x))
  }
  if (materialItemDraft.idx == null) {
    if (form.lessonMaterials.items.some((it) => it.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的课件组已存在，请修改课次`)
    }
    form.lessonMaterials.items.push(cleaned)
  } else {
    const oldNo = form.lessonMaterials.items[materialItemDraft.idx].lessonNo
    if (oldNo !== cleaned.lessonNo && form.lessonMaterials.items.some((it) => it.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的课件组已存在，请修改课次`)
    }
    form.lessonMaterials.items.splice(materialItemDraft.idx, 1, cleaned)
  }
  form.lessonMaterials.items.sort((a, b) => a.lessonNo - b.lessonNo)
  materialItemSnapshot.value = '' // 已确认,清掉基线
  materialItemDialog.value = false
}

async function onMaterialItemBeforeClose(done) {
  if (!materialItemSnapshot.value) {
    done()
    return
  }
  const cur = JSON.stringify(materialItemDraft.data)
  if (cur === materialItemSnapshot.value) {
    materialItemSnapshot.value = ''
    done()
    return
  }
  try {
    await ElMessageBox.confirm(
      '当前课件组有未保存的修改(包括刚上传的课件),关闭后不会保存。确定要关闭吗?',
      '有未保存的修改',
      { type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }
    )
    materialItemSnapshot.value = ''
    done()
  } catch {
    // 继续编辑
  }
}

function removeMaterialItem(idx) {
  form.lessonMaterials.items.splice(idx, 1)
}

function beforeMaterialUpload(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('课件超过 20MB 限制')
    return false
  }
  return true
}

async function uploadMaterialInDialog(req) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'subjectLessonMaterial' })
    if (!Array.isArray(materialItemDraft.data.fileIds)) materialItemDraft.data.fileIds = []
    materialItemDraft.data.fileIds.push(data.id)
    materialNames.set(String(data.id), data.originalName || data.id)
    ElMessage.success('课件已上传,点"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

/* ----- 海报 / 视频 单文件上传(走 FilePicker) ----- */
const mediaPicker = ref(false)
const mediaPickerKind = ref('poster') // 'poster' | 'video'
const mediaPickerScope = computed(() => 'subjectSyllabus')
const mediaPickerTitle = computed(() => (mediaPickerKind.value === 'poster' ? '选择海报' : '选择宣传视频'))
const mediaPickerMimePrefix = computed(() => (mediaPickerKind.value === 'poster' ? 'image/' : 'video/'))

function openPicker(kind) {
  mediaPickerKind.value = kind
  mediaPicker.value = true
}

function beforePosterUpload(file) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('海报必须是图片')
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('海报超过 20MB 限制')
    return false
  }
  return true
}

function beforeVideoUpload(file) {
  if (!file.type.startsWith('video/')) {
    ElMessage.error('宣传视频必须是视频文件')
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('视频超过 20MB 限制')
    return false
  }
  return true
}

async function uploadMedia(req, kind) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'subjectSyllabus' })
    const v = { _id: String(data.id), url: data.url, originalName: data.originalName }
    if (kind === 'poster') form.posterFileId = v
    else form.videoFileId = v
    ElMessage.success((kind === 'poster' ? '海报' : '视频') + '已上传,点"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function onPickMedia(files) {
  const f = Array.isArray(files) ? files[0] : files
  if (!f) return
  const v = { _id: String(f._id), url: f.url, originalName: f.originalName }
  if (mediaPickerKind.value === 'poster') form.posterFileId = v
  else form.videoFileId = v
}

function onPickMaterials(files) {
  if (!Array.isArray(materialItemDraft.data.fileIds)) materialItemDraft.data.fileIds = []
  const existing = new Set(materialItemDraft.data.fileIds.map(String))
  for (const f of files) {
    const id = String(f._id)
    if (!existing.has(id)) {
      materialItemDraft.data.fileIds.push(id)
      materialNames.set(id, f.originalName || id)
      existing.add(id)
    }
  }
}

/* ----- 跨机构同步（仅平台超管） ----- */

// 当前目标机构名称（从 auth.orgs / auth.currentOrgId 推导）
const currentOrgName = computed(() => {
  const id = auth.currentOrgId
  if (!id) return ''
  const org = (auth.orgs || []).find((o) => (o.id || o._id) === id)
  return org ? org.name : ''
})

const syncDialog = ref(false)
const sourceOrgs = ref([])
const sourceOrgsLoading = ref(false)
const selectedSourceOrgId = ref('')
const sourceSubjects = ref([])
const sourceSubjectsLoading = ref(false)
const existingNamesInCurrentOrg = ref(new Set())
const selectedSubjectIds = ref([])
const syncing = ref(false)
const syncTableRef = ref(null)

async function openSync() {
  // 防御性: 非超管即便绕开 v-if 触发到这里, 也不发同步 API
  if (!auth.isPlatformAdmin) {
    ElMessage.warning('仅平台超管可执行跨机构同步')
    return
  }
  syncDialog.value = true
  // 重置状态
  sourceOrgs.value = []
  selectedSourceOrgId.value = ''
  sourceSubjects.value = []
  selectedSubjectIds.value = []
  // 预拉当前机构学科名（用于 existsInCurrent 判定）
  try {
    const r = await subjectApi.list({ pageSize: 500 })
    existingNamesInCurrentOrg.value = new Set((r.data || []).map((s) => s.name))
  } catch (e) {
    // ignore; 弹窗继续打开
  }
  // 默认列前 20 个源机构
  await searchSourceOrgs('')
}

async function searchSourceOrgs(keyword) {
  sourceOrgsLoading.value = true
  try {
    const r = await subjectApi.listSourceOrgs({ keyword })
    sourceOrgs.value = r.data.items || []
  } finally {
    sourceOrgsLoading.value = false
  }
}

async function onSourceOrgChange(orgId) {
  sourceSubjects.value = []
  selectedSubjectIds.value = []
  if (!orgId) return
  sourceSubjectsLoading.value = true
  try {
    const r = await subjectApi.listByOrg(orgId)
    sourceSubjects.value = (r.data.items || []).map((s) => ({
      ...s,
      existsInCurrent: existingNamesInCurrentOrg.value.has(s.name)
    }))
    // 预选所有「可同步」行
    await nextTick()
    if (syncTableRef.value) {
      sourceSubjects.value
        .filter((s) => !s.existsInCurrent)
        .forEach((row) => syncTableRef.value.toggleRowSelection(row, true))
    }
  } finally {
    sourceSubjectsLoading.value = false
  }
}

function onSelectionChange(rows) {
  selectedSubjectIds.value = rows.map((r) => r._id)
}

async function confirmSync() {
  if (!selectedSubjectIds.value.length) return
  const N = selectedSubjectIds.value.length
  try {
    await ElMessageBox.confirm(
      `将向当前机构创建 ${N} 个学科（与本公司不同名），是否继续？`,
      '提示',
      { type: 'info' }
    )
  } catch {
    return
  }
  syncing.value = true
  try {
    const r = await subjectApi.sync({
      sourceOrgId: selectedSourceOrgId.value,
      subjectIds: selectedSubjectIds.value
    })
    const { createdCount = 0, skippedCount = 0 } = r.data || {}
    ElMessage.success(`已创建 ${createdCount} 个，跳过 ${skippedCount} 个`)
    syncDialog.value = false
    load()
  } finally {
    syncing.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page {
  max-width: 100%;
}
.hint {
  color: #909399;
  font-size: 13px;
  margin: 4px 0 12px;
}
.muted {
  color: #c0c4cc;
}
.obj-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.obj-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.obj-row .el-input {
  flex: 1;
}
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.sync-summary { margin-top: 12px; color: #606266; font-size: 13px; }
.target-org-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  border: 1px dashed #dcdfe6;
  margin-bottom: 4px;
}
.target-org-bar .label { color: #909399; font-size: 13px; }
.target-org-bar .value { color: #303133; font-weight: 600; font-size: 14px; }
.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.materials {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.media-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  flex-wrap: wrap;
}
.media-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.media-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.media-empty {
  width: 120px;
  height: 80px;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.media-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.material-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafbfc;
}
.text-12 { font-size: 12px; color: #606266; }
</style>
