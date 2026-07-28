<!--
  SubjectDetail.vue (2026-07-20 新增)
  学科详情页 —— 「课纲/课件在详情页编辑」分离的承载页
  - 数据源: R-0501 GET /api/v1/subjects/:id
  - 写入: R-0503 PUT /api/v1/subjects/:id（更新 syllabus / lessonMaterials / 基本信息）
  - 路由: /subjects/:id
-->
<template>
  <div class="page" v-loading="loading">
    <el-page-header :icon="ArrowLeft" content="返回学科列表" @back="onBack" class="page-header">
      <template #content>
        <span class="page-header__title">{{ subject.name || '学科详情' }}</span>
        <el-tag v-if="subject.category" size="small" style="margin-left: 8px">{{ subject.category.name }}</el-tag>
        <el-tag v-else size="small" type="info" style="margin-left: 8px">未分类</el-tag>
      </template>
    </el-page-header>

    <div v-if="!loading && !subject._id" class="empty-wrap">
      <el-empty description="学科不存在或已被删除" />
    </div>

    <template v-else-if="subject._id">
      <!-- ───────────────────────────────────────────────────────────
        基本信息 (只读卡片 + 顶角 「编辑基础信息」 按钮)
      ─────────────────────────────────────────────────────────── -->
      <el-card class="block" shadow="never">
        <template #header>
          <div class="card-head">
            <b>基本信息</b>
            <el-button size="small" type="primary" :icon="Edit" @click="openBasicEdit">
              编辑基础信息
            </el-button>
          </div>
        </template>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="名称">{{ subject.name }}</el-descriptions-item>
          <el-descriptions-item label="分类">
            <span v-if="subject.category">{{ subject.category.name }}</span>
            <el-tag v-else type="info" size="small">未分类</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="教学目标" :span="2">
            <template v-if="subject.objectives && subject.objectives.length">
              <el-tag
                v-for="(o, i) in subject.objectives"
                :key="i"
                size="small"
                style="margin-right: 6px; margin-bottom: 4px"
              >{{ o }}</el-tag>
            </template>
            <span v-else class="muted">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="海报" :span="2">
            <el-image
              v-if="subject.posterFileId && subject.posterFileId.url"
              :src="subject.posterFileId.url"
              :preview-src-list="[subject.posterFileId.url]"
              fit="cover"
              style="width: 160px; height: 100px; border-radius: 4px"
              :hide-on-click-modal="true"
            />
            <span v-else class="muted">未上传</span>
          </el-descriptions-item>
          <el-descriptions-item label="宣传视频" :span="2">
            <video
              v-if="subject.videoFileId && subject.videoFileId.url"
              :src="subject.videoFileId.url"
              style="width: 240px; height: 135px; border-radius: 4px; background: #000"
              controls
            />
            <span v-else class="muted">未上传</span>
          </el-descriptions-item>
          <el-descriptions-item label="课程简介" :span="2">
            <div class="desc-text">{{ subject.description || '-' }}</div>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- ───────────────────────────────────────────────────────────
        教学大纲 (2026-07-20 从 Subjects.vue 拆出)
      ─────────────────────────────────────────────────────────── -->
      <el-card class="block" shadow="never">
        <template #header>
          <div class="card-head">
            <b>教学大纲（{{ syllabusLessons.length }} 节）</b>
            <el-button size="small" type="primary" :icon="Plus" @click="openSyllabusLessonDialog()">
              添加课时
            </el-button>
          </div>
        </template>

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
        <el-empty
          v-else
          description="暂无教学大纲，点击「添加课时」开始配置"
          :image-size="80"
        />
      </el-card>

      <!-- ───────────────────────────────────────────────────────────
        每堂课课件 (2026-07-20 从 Subjects.vue 拆出)
      ─────────────────────────────────────────────────────────── -->
      <el-card class="block" shadow="never">
        <template #header>
          <div class="card-head">
            <b>每堂课课件（{{ lessonMaterialItems.length }} 组）</b>
            <el-button size="small" type="primary" :icon="Plus" @click="openMaterialItemDialog()">
              添加课件组
            </el-button>
          </div>
        </template>

        <el-table v-if="lessonMaterialItems.length" :data="lessonMaterialItems" border size="small">
          <el-table-column prop="lessonNo" label="课次" width="70" />
          <el-table-column label="课件数" width="80">
            <template #default="{ row }">
              <!-- 2026-07-28: materials 数组长度 (file + html 混合) -->
              <span style="color: #606266">{{ (row.materials || []).length }}</span>
            </template>
          </el-table-column>
          <el-table-column label="内容" min-width="320">
            <template #default="{ row }">
              <!-- 2026-07-28: 优先读 server enrich 过的 materials; 旧数据只有 fileIds 时降级展示 -->
              <template v-if="row.materials && row.materials.length">
                <template v-for="(m, idx) in row.materials.slice(0, 3)" :key="`${row.lessonNo}-${idx}-${m.kind}`">
                  <!-- file 类型 chip -->
                  <el-tag
                    v-if="m.kind === 'file'"
                    size="small"
                    :type="m.file ? undefined : 'info'"
                    style="margin-right: 4px; margin-bottom: 4px; cursor: pointer"
                    @click="openFilePreview(fileOf(m.file || { _id: m.fileId, originalName: m.title || '已删除' }))"
                  >
                    <el-icon v-if="!m.file" style="margin-right: 2px"><Document /></el-icon>
                    {{ m.file?.originalName || m.title || (m.fileId || '').slice(-6) || '文件' }}
                  </el-tag>
                  <!-- html 类型 chip -->
                  <el-tag
                    v-else-if="m.kind === 'html'"
                    size="small"
                    type="warning"
                    style="margin-right: 4px; margin-bottom: 4px; cursor: pointer"
                    @click="openHtmlPreview(m)"
                  >
                    <el-icon style="margin-right: 2px"><Memo /></el-icon>
                    {{ m.title || '富文本' }}
                  </el-tag>
                </template>
                <el-tag v-if="row.materials.length > 3" type="info" size="small">+{{ row.materials.length - 3 }}</el-tag>
              </template>
              <!-- 兼容: 老数据 (没 materials 字段) 仅 fileIds -->
              <template v-else-if="row.fileIds && row.fileIds.length">
                <el-tag
                  v-for="f in row.fileIds.slice(0, 3)"
                  :key="fileKey(f)"
                  size="small"
                  :type="fileOf(f)._lost ? 'info' : undefined"
                  style="margin-right: 4px; margin-bottom: 4px; cursor: pointer"
                  @click="openFilePreview(fileOf(f))"
                >
                  <el-icon v-if="fileOf(f)._lost" style="margin-right: 2px"><Document /></el-icon>
                  {{ materialName(f) }}
                </el-tag>
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
        <el-empty
          v-else
          description="暂无课件，点击「添加课件组」上传"
          :image-size="80"
        />
      </el-card>

      <!-- 危险操作 -->
      <el-card v-if="isPlatformAdmin" class="block" shadow="never">
        <template #header>
          <div class="card-head">
            <b style="color: #f56c6c">危险操作</b>
          </div>
        </template>
        <DestructiveConfirm
          :target="`学科 ${subject.name}`"
          warning="中风险"
          :precheck-notes="['该学科不被任何课程产品引用', '该学科不被任何开班作为主学科']"
          :precheck="() => subjectApi.removableCheck(subject._id).then((r) => r.data)"
          @confirm="onRemoveConfirm"
        >
          <el-button type="danger">误操删除</el-button>
        </DestructiveConfirm>
        <span class="form-tip" style="margin-left: 8px">
          物理删除前会校验业务引用 (课程产品 / 开班主学科)
        </span>
      </el-card>
    </template>

    <!-- ─────────────────────────────────────────────────────────────
      编辑基础信息弹窗 (与 Subjects.vue 同样的精简版, 仅基础字段)
    ───────────────────────────────────────────────────────────── -->
    <el-dialog
      v-model="basicEditDialog"
      title="编辑基础信息"
      width="900px"
      :before-close="onBasicEditBeforeClose"
      @closed="resetBasicForm"
    >
      <el-form ref="basicFormRef" :model="basicForm" :rules="basicRules" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="basicForm.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="分类">
          <el-tree-select
            v-model="basicForm.category"
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
            <div v-for="(o, i) in basicForm.objectives" :key="i" class="obj-row">
              <el-input v-model="basicForm.objectives[i]" maxlength="200" placeholder="如：掌握基础乐理" />
              <el-button link type="danger" :icon="Delete" @click="basicForm.objectives.splice(i, 1)" />
            </div>
            <el-button :icon="Plus" size="small" @click="basicForm.objectives.push('')">添加目标</el-button>
          </div>
        </el-form-item>
        <el-form-item label="海报">
          <div class="media-row">
            <div v-if="basicForm.posterFileId" class="media-preview">
              <el-image
                :src="basicForm.posterFileId.url"
                fit="cover"
                style="width: 120px; height: 80px; border-radius: 4px"
                :preview-src-list="[basicForm.posterFileId.url]"
                :hide-on-click-modal="true"
              />
              <div class="media-meta">
                <span class="text-12">{{ basicForm.posterFileId.originalName || '已选海报' }}</span>
                <el-button link size="small" type="danger" @click="basicForm.posterFileId = null">移除</el-button>
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
                :http-request="(req) => uploadBasicMedia(req, 'poster')"
                :before-upload="beforePosterUpload"
                accept="image/*"
              >
                <el-button :icon="Upload" size="small">上传新海报</el-button>
              </el-upload>
              <el-button :icon="Folder" size="small" @click="openBasicPicker('poster')">从文件库选</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="宣传视频">
          <div class="media-row">
            <div v-if="basicForm.videoFileId" class="media-preview">
              <video
                :src="basicForm.videoFileId.url"
                style="width: 160px; height: 90px; border-radius: 4px; background: #000"
                controls
              />
              <div class="media-meta">
                <span class="text-12">{{ basicForm.videoFileId.originalName || '已选视频' }}</span>
                <el-button link size="small" type="danger" @click="basicForm.videoFileId = null">移除</el-button>
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
                :http-request="(req) => uploadBasicMedia(req, 'video')"
                :before-upload="beforeVideoUpload"
                accept="video/*"
              >
                <el-button :icon="Upload" size="small">上传新视频</el-button>
              </el-upload>
              <el-button :icon="Folder" size="small" @click="openBasicPicker('video')">从文件库选</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="课程简介">
          <el-input
            v-model="basicForm.description"
            type="textarea"
            :rows="3"
            placeholder="富文本内容（当前使用纯文本，后续可接编辑器）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="basicEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="basicSaving" @click="submitBasic">确定</el-button>
      </template>
    </el-dialog>

    <!-- ─────────────────────────────────────────────────────────────
      课时编辑弹窗
    ───────────────────────────────────────────────────────────── -->
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

    <!-- ─────────────────────────────────────────────────────────────
      课件组编辑弹窗
    ───────────────────────────────────────────────────────────── -->
    <el-dialog
      v-model="materialItemDialog"
      :title="materialItemDraft.idx === null ? '新增课件组' : '编辑课件组'"
      width="800px"
      :close-on-click-modal="false"
      :before-close="onMaterialItemBeforeClose"
      append-to-body
      @closed="resetMaterialDraft"
    >
      <el-form :model="materialItemDraft.data" label-width="100px">
        <el-form-item label="课次" required>
          <el-input-number v-model="materialItemDraft.data.lessonNo" :min="1" :max="999" :step="1" />
        </el-form-item>
        <el-form-item label="课件内容">
          <div class="materials">
            <!-- 已添加的课件 (file + html 混合显示) -->
            <div
              v-for="(m, i) in materialItemDraft.data.materials"
              :key="materialKey(m, i)"
              class="material-chip"
            >
              <!-- file 类 -->
              <template v-if="m.kind === 'file'">
                <el-icon style="margin-right: 4px"><Document /></el-icon>
                <span class="text-12 clickable-name" @click="openFilePreview(fileOf(m.file || { _id: m.fileId, originalName: m.originalName }))">
                  {{ m.originalName || m.fileId?.slice(-6) || '文件' }}
                </span>
                <el-button link size="small" type="primary" @click="openFilePreview(fileOf(m.file || { _id: m.fileId, originalName: m.originalName }))">预览</el-button>
              </template>
              <!-- html 类 -->
              <template v-else-if="m.kind === 'html'">
                <el-icon style="margin-right: 4px" color="#409eff"><Memo /></el-icon>
                <span class="text-12" style="color:#409eff">富文本</span>
                <span v-if="m.title" class="text-12 muted" style="margin-left:4px">《{{ m.title }}》</span>
              </template>
              <el-button link size="small" type="danger" @click="materialItemDraft.data.materials.splice(i, 1)">移除</el-button>
            </div>

            <!-- 两 tab 添加: 文件 / 富文本 -->
            <el-tabs v-model="materialActiveTab" class="material-add-tabs">
              <el-tab-pane label="📁 文件" name="file">
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                  <el-upload
                    :show-file-list="false"
                    :auto-upload="true"
                    :http-request="uploadMaterialInDialog"
                    :before-upload="beforeMaterialUpload"
                    accept="application/pdf,.pdf,video/*"
                  >
                    <el-button :icon="Upload" size="small">上传新课件</el-button>
                  </el-upload>
                  <el-button :icon="Folder" size="small" link @click="materialPicker = true">从文件库选</el-button>
                </div>
                <div class="form-tip">支持 PDF、视频 (mp4 / mov / webm / avi / mkv 等)</div>
              </el-tab-pane>
              <el-tab-pane label="📝 富文本 (HTML)" name="html">
                <!-- HTML 编辑器 (2026-07-28): 工具栏 (B/I/U/link/list) + textarea
                     - 不引入第三方富文本库 (项目无 Tinymce/Wangeditor),
                       工具栏辅助插入常见标签, 教师可手写/粘贴 HTML
                     - title 仅展示用, 列表 chip 会显示 -->
                <div class="html-editor">
                  <div class="html-editor-toolbar">
                    <el-button-group>
                      <el-button size="small" @click="wrapHtmlSelection(materialNewHtml, '<b>', '</b>')"><b>B</b></el-button>
                      <el-button size="small" @click="wrapHtmlSelection(materialNewHtml, '<i>', '</i>')"><i>I</i></el-button>
                      <el-button size="small" @click="wrapHtmlSelection(materialNewHtml, '<u>', '</u>')"><u>U</u></el-button>
                    </el-button-group>
                    <el-button-group>
                      <el-button size="small" @click="wrapHtmlSelection(materialNewHtml, `<a href='https://' target='_blank'>`, '</a>')">🔗 链接</el-button>
                      <el-button size="small" @click="insertHtmlAtCursor(materialNewHtml, '\n<ul>\n  <li>...</li>\n</ul>\n')">• 列表</el-button>
                      <el-button size="small" @click="insertHtmlAtCursor(materialNewHtml, '\n<p>...</p>\n')">¶ 段落</el-button>
                      <el-button size="small" @click="insertHtmlAtCursor(materialNewHtml, '\n<h3>小节标题</h3>\n')">H3</el-button>
                    </el-button-group>
                    <el-input
                      v-model="materialNewHtmlTitle"
                      size="small"
                      placeholder="标题（可选）"
                      style="width: 180px; margin-left: auto"
                      maxlength="200"
                      show-word-limit
                    />
                  </div>
                  <el-input
                    ref="materialNewHtmlInput"
                    v-model="materialNewHtml"
                    type="textarea"
                    :rows="6"
                    placeholder='支持 HTML: <p>, <a href="">, <ul><li>, <h3>, <strong>, <em>, <img src="https://..."/>, ...'
                    maxlength="204800"
                    show-word-limit
                  />
                  <div style="display:flex; justify-content:flex-end; margin-top:6px">
                    <el-button size="small" type="primary" :disabled="!materialNewHtml.trim()" @click="addHtmlMaterial">
                      添加到课件
                    </el-button>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="materialItemDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmMaterialItem">确定</el-button>
      </template>
    </el-dialog>

    <!-- 海报 / 视频文件选择器(单选) -->
    <FilePicker
      v-model="mediaPicker"
      :scope="mediaPickerScope"
      :title="mediaPickerTitle"
      :mime-prefix="mediaPickerMimePrefix"
      @select="onPickMedia"
    />

    <!-- 课件文件选择器(从文件库选) -->
    <FilePicker
      v-model="materialPicker"
      multiple
      scope="subjectLessonMaterial"
      title="选择课件文件"
      @select="onPickMaterials"
    />

    <!-- 富文本课件预览 (2026-07-28): 列表 chip 点击触发, 走 v-html 渲染 -->
    <el-dialog
      v-model="htmlPreviewDialog"
      :title="htmlPreviewTitle"
      width="720px"
      top="6vh"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div v-if="htmlPreviewContent" class="html-preview-body" v-html="htmlPreviewContent" />
      <template #footer>
        <el-button @click="htmlPreviewDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 课件文件预览 (R-3010 inline, 走浏览器原生 PDF viewer / 图片 / 视频) -->
    <!--
      2026-07-20: 取消 PDF.js 自渲染路线 (vite dev 下 worker 私有字段踩坑 + 调试时间太长),
      改回浏览器原生渲染. 文件上传已限定 PDF, 浏览器 PDF viewer 自带「下载」按钮
      是 web 物理限制, 业务宣导 + R-3010 inline Content-Disposition 防「自动另存」足够.
    -->
    <el-dialog
      v-model="previewDialog"
      :title="previewFile ? previewFile.originalName : '课件预览'"
      width="900px"
      top="5vh"
      :close-on-click-modal="false"
      destroy-on-close
      @closed="onPreviewClosed"
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="课件版权保护"
        description="本预览仅供机构内部在线查看，浏览器可能仍提供下载 — 请勿外传。下载保护涉及业务宣导。"
        style="margin-bottom: 12px"
      />
      <div v-if="previewFile && previewMime" class="preview-frame-wrap">
        <iframe
          v-if="previewFile && previewFile._id"
          :src="previewSrc"
          class="preview-frame"
          frameborder="0"
          allowfullscreen
        />
        <div v-else class="preview-missing">文件已被删除，无法预览</div>
      </div>
      <div v-else class="preview-missing">文件已被删除，无法预览</div>
      <template #footer>
        <el-button @click="previewDialog = false">关闭</el-button>
        <el-button type="primary" @click="openInNewTab" :disabled="!previewFile || !previewFile._id">
          在新窗口打开
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Edit, Delete, Plus, Document, Folder, Upload, Picture, VideoCamera, Memo
} from '@element-plus/icons-vue'
import { subjectApi } from '@/api/subject'
import { storageApi } from '@/api/storage'
import { categoryApi } from '@/api/category'
import { useAuthStore } from '@/stores/auth'
import { handleRemoveError } from '@/utils/removable'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import FilePicker from '@/components/FilePicker.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const loading = ref(false)
const subject = reactive({})
const categoryTree = ref([])

/* ─────────────────────────────────────────────────────────
  1. 加载 + 返回
───────────────────────────────────────────────────────── */
async function load() {
  const id = route.params.id
  if (!id) return
  loading.value = true
  try {
    const r = await subjectApi.detail(id)
    Object.assign(subject, r.data || {})
    // 初始化课件名称缓存 (批量 populate 在 list 才有, detail 没; 用户加入时再懒查)
  } catch (e) {
    console.error('[SubjectDetail.load] failed:', e?.response?.data || e)
  } finally {
    loading.value = false
  }
}

function onBack() {
  router.push('/subjects')
}

watch(() => route.params.id, load, { immediate: true })

/* ─────────────────────────────────────────────────────────
  2. 基本信息编辑弹窗
───────────────────────────────────────────────────────── */
const basicEditDialog = ref(false)
const basicFormRef = ref()
const basicSaving = ref(false)
const basicForm = reactive(emptyBasicForm())

function emptyBasicForm() {
  return {
    name: '',
    category: null,
    objectives: [],
    posterFileId: null,
    videoFileId: null,
    description: ''
  }
}

const basicRules = {
  name: [{ required: true, message: '请填写名称', trigger: 'blur' }]
}

const basicSnapshot = ref('')

function openBasicEdit() {
  Object.assign(basicForm, {
    name: subject.name || '',
    category: subject.category ? (subject.category.id || subject.category._id) : null,
    objectives: Array.isArray(subject.objectives) ? [...subject.objectives] : [],
    posterFileId: subject.posterFileId
      ? {
          _id: String(subject.posterFileId._id || subject.posterFileId),
          url: subject.posterFileId.url,
          originalName: subject.posterFileId.originalName
        }
      : null,
    videoFileId: subject.videoFileId
      ? {
          _id: String(subject.videoFileId._id || subject.videoFileId),
          url: subject.videoFileId.url,
          originalName: subject.videoFileId.originalName
        }
      : null,
    description: subject.description || ''
  })
  basicFormRef.value?.clearValidate()
  basicSnapshot.value = JSON.stringify(basicForm)
  basicEditDialog.value = true
  loadCategoryTree()
}

function resetBasicForm() {
  Object.assign(basicForm, emptyBasicForm())
}

function isBasicDirty() {
  if (!basicSnapshot.value) return false
  return JSON.stringify(basicForm) !== basicSnapshot.value
}

async function onBasicEditBeforeClose(done) {
  if (!isBasicDirty()) {
    done()
    return
  }
  try {
    await ElMessageBox.confirm(
      '当前编辑的基础信息有未保存的修改,关闭后不会保存。确定要关闭吗?',
      '有未保存的修改',
      { type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }
    )
    done()
  } catch {
    // 选「继续编辑」
  }
}

async function submitBasic() {
  if (!basicFormRef.value) return
  try {
    await basicFormRef.value.validate()
  } catch (_) {
    return
  }
  basicSaving.value = true
  try {
    const objectives = (basicForm.objectives || []).map((o) => (o || '').trim()).filter(Boolean)
    const payload = {
      name: basicForm.name,
      category: basicForm.category || null,
      objectives,
      posterFileId: basicForm.posterFileId ? (basicForm.posterFileId._id || basicForm.posterFileId) : null,
      videoFileId: basicForm.videoFileId ? (basicForm.videoFileId._id || basicForm.videoFileId) : null,
      description: basicForm.description || ''
    }
    await subjectApi.update(subject._id, payload)
    ElMessage.success('已更新')
    basicEditDialog.value = false
    load() // 重新拉详情以保证 category 等 populate 字段一致
  } finally {
    basicSaving.value = false
  }
}

async function loadCategoryTree() {
  const r = await categoryApi.tree({ model: 'Subject' })
  categoryTree.value = r.data || []
}

/* ─────────────────────────────────────────────────────────
  3. 教学大纲 (内嵌编辑器)
───────────────────────────────────────────────────────── */
const syllabusLessons = computed(() => (subject.syllabus && subject.syllabus.lessons) || [])

const syllabusLessonDialog = ref(false)
const syllabusLessonDraft = reactive({
  idx: null,
  data: { lessonNo: 1, topic: '', description: '', objectives: [], durationMinutes: null }
})
const syllabusLessonSnapshot = ref('')

function emptySyllabusLessonDraft() {
  return { lessonNo: 1, topic: '', description: '', objectives: [], durationMinutes: null }
}

function openSyllabusLessonDialog(idx) {
  if (idx == null) {
    syllabusLessonDraft.idx = null
    Object.assign(syllabusLessonDraft.data, emptySyllabusLessonDraft())
  } else {
    const src = syllabusLessons.value[idx]
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

function cleanLessonDraft() {
  const draft = syllabusLessonDraft.data
  return {
    lessonNo: Number(draft.lessonNo),
    topic: (draft.topic || '').trim(),
    description: draft.description || '',
    objectives: (draft.objectives || []).map((o) => (o || '').trim()).filter(Boolean),
    durationMinutes: draft.durationMinutes != null && draft.durationMinutes > 0 ? Number(draft.durationMinutes) : null
  }
}

async function confirmSyllabusLesson() {
  const cleaned = cleanLessonDraft()
  // 防御性: 校验 lessonNo 唯一 (本地还未保存的草稿也算)
  if (syllabusLessonDraft.idx == null) {
    if (syllabusLessons.value.some((l) => l.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课已存在，请修改课次`)
    }
  } else {
    const oldNo = syllabusLessons.value[syllabusLessonDraft.idx].lessonNo
    if (
      oldNo !== cleaned.lessonNo &&
      syllabusLessons.value.some((l) => l.lessonNo === cleaned.lessonNo)
    ) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课已存在，请修改课次`)
    }
  }
  // 推到本地 (乐观更新)
  const next = {
    totalLessons: syllabusLessons.value.length + (syllabusLessonDraft.idx == null ? 1 : 0),
    lessons: [...syllabusLessons.value]
  }
  if (syllabusLessonDraft.idx == null) {
    next.lessons.push(cleaned)
  } else {
    next.lessons.splice(syllabusLessonDraft.idx, 1, cleaned)
  }
  next.lessons.sort((a, b) => a.lessonNo - b.lessonNo)
  syllabusLessonSnapshot.value = ''
  syllabusLessonDialog.value = false
  await persistSyllabus(next)
}

async function removeSyllabusLesson(idx) {
  try {
    await ElMessageBox.confirm(
      `删除第 ${syllabusLessons.value[idx].lessonNo} 课：${syllabusLessons.value[idx].topic || '(无主题)'}?`,
      '确认删除课时',
      { type: 'warning' }
    )
  } catch {
    return
  }
  const next = {
    totalLessons: syllabusLessons.value.length - 1,
    lessons: syllabusLessons.value.filter((_, i) => i !== idx)
  }
  await persistSyllabus(next)
}

async function persistSyllabus(next) {
  try {
    const r = await subjectApi.update(subject._id, { syllabus: next })
    subject.syllabus = r.data.syllabus || next
    ElMessage.success('教学大纲已更新')
  } catch (e) {
    ElMessage.error('大纲保存失败: ' + (e?.response?.data?.message || e.message))
  }
}

async function onSyllabusLessonBeforeClose(done) {
  if (!syllabusLessonSnapshot.value) {
    done()
    return
  }
  const cur = JSON.stringify(syllabusLessonDraft.data)
  if (cur === syllabusLessonSnapshot.value) {
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

/* ─────────────────────────────────────────────────────────
  4. 课件 (内嵌编辑器)
───────────────────────────────────────────────────────── */
const lessonMaterialItems = computed(
  () => (subject.lessonMaterials && subject.lessonMaterials.items) || []
)

/**
 * 把 server 给的 (string | { _id, originalName, url, mime }) 统一成「课件对象」。
 * - 历史数据里 fileIds 仍是字符串（用 fileKey 降级展示）
 * - 新数据由 subject.service.enrichLessonMaterials 返回对象
 *
 * 返回的对象一定有 _id；丢失的文件多带 _lost=true 让 UI 显示「已丢失」徽标。
 */
function fileOf(f) {
  if (!f) return { _id: '', originalName: '已删除', _lost: true }
  if (typeof f === 'string') {
    return {
      _id: f,
      originalName: materialNames.get(f) || f.slice(-6),
      _lost: true
    }
  }
  return f
}

function fileKey(f) {
  // v-for 用的 key
  return typeof f === 'string' ? `s:${f}` : `o:${f._id}`
}

const materialNames = reactive(new Map())
function materialName(f) {
  // 兼容 string / object
  if (typeof f === 'string') return materialNames.get(f) || f.slice(-6)
  return f.originalName || f._id?.slice(-6) || '文件'
}

const materialItemDialog = ref(false)
// 2026-07-28: draft 改为 { lessonNo, materials: [{ kind, ... }] }, 后端 normalize 派生 fileIds
const materialItemDraft = reactive({ idx: null, data: { lessonNo: 1, materials: [] } })
const materialItemSnapshot = ref('')
const materialPicker = ref(false)
// 弹窗里"当前激活的 tab" ('file' | 'html'); 切换 tab 时只刷新提示,不动 materials
const materialActiveTab = ref('file')

// 富文本编辑器临时状态 (2026-07-28):
// - materialNewHtml: textarea 双向绑定; 不直接进 materials, 等用户点"添加到课件"才入数组
// - materialNewHtmlTitle: 列表 chip 上展示用的标题 (≤200字)
// - 切换 file ↔ html tab 不丢草稿, 关弹窗时统一清空 (在 resetMaterialDraft 里)
const materialNewHtml = ref('')
const materialNewHtmlTitle = ref('')
const materialNewHtmlInput = ref(null)

/** 把当前 textarea 内容追加成一条 html material,清空草稿 */
function addHtmlMaterial() {
  const html = (materialNewHtml.value || '').trim()
  if (!html) return
  if (!Array.isArray(materialItemDraft.data.materials)) materialItemDraft.data.materials = []
  materialItemDraft.data.materials.push({
    kind: 'html',
    fileId: null,
    htmlContent: html,
    title: (materialNewHtmlTitle.value || '').trim().slice(0, 200)
  })
  materialNewHtml.value = ''
  materialNewHtmlTitle.value = ''
  ElMessage.success('已添加富文本课件,点"确定"生效')
}

/** v-for 用 key (file 用 id, html 用入数组的顺序索引) */
function materialKey(m, i) {
  if (m.kind === 'file') return `f:${m.fileId || 'lost'}:${i}`
  return `h:${i}:${(m.htmlContent || '').length}`
}

/**
 * 在 textarea 当前选区两端插入 left/right 标签; 没选区就把整行包起来.
 * 简化: 不依赖 selectionStart 完美还原, 走"插入字符串"路线 — 末尾追加或包裹全文.
 */
function wrapHtmlSelection(textareaRef, left, right) {
  const ta = textareaRef?.value?.$el?.querySelector?.('textarea') || textareaRef?.$el?.querySelector?.('textarea')
  // Element Plus el-input type=textarea 在内部包了 textarea; 走 ref 可能拿到组件实例
  // 走 dom 直接拿 (兼容):
  const el = ta || document.activeElement
  if (!el || el.tagName !== 'TEXTAREA') {
    // 兜底: 全文包
    materialNewHtml.value = `${left}${materialNewHtml.value}${right}`
    return
  }
  const start = el.selectionStart || 0
  const end = el.selectionEnd || 0
  const val = materialNewHtml.value
  materialNewHtml.value = val.slice(0, start) + left + val.slice(start, end) + right + val.slice(end)
  // 选中包起来的部分, 方便继续编辑
  // nextTick 让 v-model 更新后再设 selection
  setTimeout(() => {
    el.focus()
    el.setSelectionRange(start + left.length, end + left.length)
  }, 0)
}

function insertHtmlAtCursor(textareaRef, snippet) {
  const ta = textareaRef?.value?.$el?.querySelector?.('textarea') || textareaRef?.$el?.querySelector?.('textarea')
  const el = ta || document.activeElement
  if (!el || el.tagName !== 'TEXTAREA') {
    materialNewHtml.value = `${materialNewHtml.value}${snippet}`
    return
  }
  const start = el.selectionStart || materialNewHtml.value.length
  const end = el.selectionEnd || start
  const val = materialNewHtml.value
  materialNewHtml.value = val.slice(0, start) + snippet + val.slice(end)
  setTimeout(() => {
    el.focus()
    el.setSelectionRange(start + snippet.length, start + snippet.length)
  }, 0)
}

/** 弹窗关闭时清空富文本草稿 */
function resetMaterialDraft() {
  materialNewHtml.value = ''
  materialNewHtmlTitle.value = ''
  materialActiveTab.value = 'file'
}

/** 把 server 给的 fileIds 数组 (string | { _id, originalName }) 统一成 { kind, fileId, file, title } 形态 */
function fileIdsToMaterials(arr) {
  return (arr || []).filter((x) => x != null).map((x) => {
    if (typeof x === 'string') {
      return {
        kind: 'file',
        fileId: x,
        file: null,
        title: '',
        // 标记: 还没 populate (弹窗里展示用)
        _lost: true,
        originalName: materialNames.get(x) || x.slice(-6)
      }
    }
    return {
      kind: 'file',
      fileId: x._id,
      file: x,
      title: '',
      originalName: x.originalName || x._id?.slice(-6) || '文件'
    }
  })
}

/** 从 server 给的 materials 数组 (populated 过) 复原成 draft 形态 */
function serverMaterialsToDraft(serverMaterials) {
  return (serverMaterials || []).map((m) => {
    if (m.kind === 'file') {
      return {
        kind: 'file',
        fileId: m.fileId,
        file: m.file, // populated 后的 { _id, originalName, url, mime, size } 或 null
        title: m.title || '',
        originalName: m.file?.originalName || m.fileId?.slice(-6) || '文件'
      }
    }
    // kind === 'html'
    return {
      kind: 'html',
      fileId: null,
      htmlContent: m.htmlContent || '',
      title: m.title || ''
    }
  })
}

/** 走 Subject.materialNames 缓存补全 + 顺手收集新增的 (后续 enrich 回填) */
function learnMaterialNames(arr) {
  for (const f of arr || []) {
    if (typeof f === 'string' && !materialNames.has(f)) {
      materialNames.set(f, f.slice(-6))
    }
  }
}

function openMaterialItemDialog(idx) {
  materialActiveTab.value = 'file'
  if (idx == null) {
    materialItemDraft.idx = null
    Object.assign(materialItemDraft.data, { lessonNo: 1, materials: [] })
  } else {
    const src = lessonMaterialItems.value[idx]
    materialItemDraft.idx = idx
    // 历史数据兼容: 优先读 materials, 否则从 fileIds 派生
    const mats = Array.isArray(src.materials) && src.materials.length
      ? serverMaterialsToDraft(src.materials)
      : fileIdsToMaterials(src.fileIds)
    learnMaterialNames(src.fileIds)
    Object.assign(materialItemDraft.data, {
      lessonNo: src.lessonNo,
      materials: mats
    })
  }
  materialItemSnapshot.value = JSON.stringify(materialItemDraft.data)
  materialItemDialog.value = true
}

async function confirmMaterialItem() {
  const draft = materialItemDraft.data
  // 把 draft.materials 清理成后端期待的形态 (id 字符串 + htmlContent + title)
  const cleanedMaterials = (draft.materials || [])
    .filter((m) => {
      if (!m) return false
      if (m.kind === 'file') return m.fileId
      if (m.kind === 'html') return m.htmlContent && m.htmlContent.trim()
      return false
    })
    .map((m) => {
      if (m.kind === 'file') {
        return { kind: 'file', fileId: String(m.fileId), title: (m.title || '').trim().slice(0, 200) }
      }
      return {
        kind: 'html',
        htmlContent: (m.htmlContent || '').slice(0, 200 * 1024),
        title: (m.title || '').trim().slice(0, 200)
      }
    })
  const cleaned = {
    lessonNo: Number(draft.lessonNo),
    materials: cleanedMaterials
  }
  if (materialItemDraft.idx == null) {
    if (lessonMaterialItems.value.some((it) => it.lessonNo === cleaned.lessonNo)) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的课件组已存在，请修改课次`)
    }
  } else {
    const oldNo = lessonMaterialItems.value[materialItemDraft.idx].lessonNo
    if (
      oldNo !== cleaned.lessonNo &&
      lessonMaterialItems.value.some((it) => it.lessonNo === cleaned.lessonNo)
    ) {
      return ElMessage.error(`第 ${cleaned.lessonNo} 课的课件组已存在，请修改课次`)
    }
  }
  const next = {
    items: [...lessonMaterialItems.value]
  }
  if (materialItemDraft.idx == null) {
    next.items.push(cleaned)
  } else {
    next.items.splice(materialItemDraft.idx, 1, cleaned)
  }
  next.items.sort((a, b) => a.lessonNo - b.lessonNo)
  materialItemSnapshot.value = ''
  materialItemDialog.value = false
  await persistLessonMaterials(next)
}

async function removeMaterialItem(idx) {
  const item = lessonMaterialItems.value[idx]
  const count = (item.materials || item.fileIds || []).length
  try {
    await ElMessageBox.confirm(
      `删除第 ${item.lessonNo} 课的课件组 (共 ${count} 项)?`,
      '确认删除课件组',
      { type: 'warning' }
    )
  } catch {
    return
  }
  const next = {
    items: lessonMaterialItems.value.filter((_, i) => i !== idx)
  }
  await persistLessonMaterials(next)
}

async function persistLessonMaterials(next) {
  try {
    const r = await subjectApi.update(subject._id, { lessonMaterials: next })
    // 后端返的 lessonMaterials 里 fileIds 是 string[]，前端需要重新 enrich 才能显示文件名
    // 直接调 load() 走详情接口拿 enrich 过的版本 —— 顺便拿到可能更新的对象
    subject.lessonMaterials = r.data.lessonMaterials || next
    ElMessage.success('课件已更新')
    await load() // 重新拉详情 (enrich fileIds → 对象)
  } catch (e) {
    ElMessage.error('课件保存失败: ' + (e?.response?.data?.message || e.message))
  }
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

/**
 * (2026-07-20) 课件限定 PDF + 视频(mp4/mov/webm/avi/mkv/m4v)
 * 服务端 [packages/server/src/config/index.js](packages/server/src/config/index.js) allowedMime
 * 默认包含 image/video/audio/pdf, 这里只放行 PDF 与 video/* —— 后端创建文件
 * 时仍会按 allowedMime 全集通过(暂不强校验 scope). 阶段 2 可在 storage.service
 * 加 scope → allowedMime 矩阵做防御深度.
 */
const ALLOWED_MATERIAL_MIME = [
  'application/pdf',
  // 常见视频 mime(浏览器 File API 都给完整 mime, 兜底靠后缀)
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'
]
// mime 拿不到时(macOS QuickTime / iPhone 录的视频有时是空 mime), 用后缀兜底
const ALLOWED_MATERIAL_EXT = /\.(pdf|mp4|m4v|mov|webm|avi|mkv)$/i

function isAllowedMaterial(fileLike) {
  // fileLike: { mime?: string, originalName?: string }
  const mime = (fileLike.mime || '').toLowerCase()
  const name = fileLike.originalName || ''
  if (ALLOWED_MATERIAL_MIME.includes(mime)) return true
  if (mime === '' && ALLOWED_MATERIAL_EXT.test(name)) return true // 空 mime 走后缀
  if (mime.startsWith('video/') && ALLOWED_MATERIAL_EXT.test(name)) return true
  return false
}

function beforeMaterialUpload(file) {
  if (!isAllowedMaterial({ mime: file.type, originalName: file.name || '' })) {
    ElMessage.error(`只支持 PDF / 视频 课件: ${file.name} (实际 ${file.type || '未知'})`)
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('文件超过 20MB 限制')
    return false
  }
  return true
}

async function uploadMaterialInDialog(req) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'subjectLessonMaterial' })
    if (!Array.isArray(materialItemDraft.data.materials)) materialItemDraft.data.materials = []
    const id = String(data.id)
    materialItemDraft.data.materials.push({
      kind: 'file',
      fileId: id,
      file: data, // 含 url/originalName/mime/size
      title: '',
      originalName: data.originalName || id
    })
    materialNames.set(id, data.originalName || id)
    ElMessage.success('课件已上传,点"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function onPickMaterials(files) {
  if (!Array.isArray(materialItemDraft.data.materials)) materialItemDraft.data.materials = []
  const existing = new Set(
    materialItemDraft.data.materials
      .filter((m) => m.kind === 'file')
      .map((m) => String(m.fileId))
  )
  // 2026-07-20: 课件限定 PDF + 视频. 文件库选的非允许文件被静默丢弃并 toast.
  let dropped = 0
  for (const f of files) {
    const id = String(f._id)
    if (existing.has(id)) continue
    if (!isAllowedMaterial({ mime: f.mime, originalName: f.originalName || '' })) {
      dropped++; continue
    }
    materialItemDraft.data.materials.push({
      kind: 'file',
      fileId: id,
      file: f,
      title: '',
      originalName: f.originalName || id
    })
    materialNames.set(id, f.originalName || id)
    existing.add(id)
  }
  if (dropped > 0) {
    ElMessage.warning(`已忽略 ${dropped} 个文件（课件只接受 PDF / 视频）`)
  }
}

/* ─────────────────────────────────────────────────────────
  4b. 课件文件预览 (R-3010 inline, 不能直接下载)
───────────────────────────────────────────────────────── */
const previewDialog = ref(false)
const previewFile = ref(null)

/** 取得合法 mime：丢失文件 / 没 mime 兜底成 application/octet-stream 不显示 (iframe 会拒绝) */
const previewMime = computed(() => previewFile.value?._lost ? '' : (previewFile.value?.mime || ''))

/**
 * 走 R-3010 /storage/files/:id/stream?disposition=inline，认证由 cookie + bearer 维持；
 * iframe 内嵌 PDF / 图片 / 视频由浏览器原生渲染。
 * 注意：浏览器内置 PDF viewer 仍带下载按钮 —— 本服务只阻断"另存为"的便利性。
 */
const previewSrc = computed(() => {
  if (!previewFile.value || previewFile.value._lost || !previewFile.value._id) return ''
  return storageApi.stream({ id: previewFile.value._id, disposition: 'inline' })
})

function openFilePreview(f) {
  const file = fileOf(f)
  if (!file._id) {
    ElMessage.warning('该文件已被删除，无法预览')
    return
  }
  previewFile.value = file
  previewDialog.value = true
}

function openInNewTab() {
  if (!previewFile.value || !previewFile.value._id) return
  window.open(previewSrc.value, '_blank', 'noopener,noreferrer')
}

/* ─────────────────────────────────────────────────────────
  4c. 富文本课件预览 (2026-07-28)
  - 列表 chip 点击触发; v-html 直接渲染 htmlContent
  - 内部不接 fileBind (HTML 是纯文本, 不计 file 引用)
  - 由 ElMessageBox 等同级别的"仅查看"弹窗
───────────────────────────────────────────────────────── */
const htmlPreviewDialog = ref(false)
const htmlPreviewTitle = ref('课件富文本')
const htmlPreviewContent = ref('')

function openHtmlPreview(m) {
  if (!m || m.kind !== 'html') return
  htmlPreviewTitle.value = m.title ? `富文本 · ${m.title}` : '富文本课件'
  htmlPreviewContent.value = m.htmlContent || ''
  htmlPreviewDialog.value = true
}

function onPreviewClosed() {
  previewFile.value = null
}

/* ─────────────────────────────────────────────────────────
  5. 基础信息弹窗内的 海报 / 视频 上传
───────────────────────────────────────────────────────── */
const mediaPicker = ref(false)
const mediaPickerKind = ref('poster')
const mediaPickerScope = computed(() => 'subjectSyllabus')
const mediaPickerTitle = computed(() => (mediaPickerKind.value === 'poster' ? '选择海报' : '选择宣传视频'))
const mediaPickerMimePrefix = computed(() => (mediaPickerKind.value === 'poster' ? 'image/' : 'video/'))

function openBasicPicker(kind) {
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

async function uploadBasicMedia(req, kind) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'subjectSyllabus' })
    const v = { _id: String(data.id), url: data.url, originalName: data.originalName }
    if (kind === 'poster') basicForm.posterFileId = v
    else basicForm.videoFileId = v
    ElMessage.success((kind === 'poster' ? '海报' : '视频') + '已上传,点"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function onPickMedia(files) {
  const f = Array.isArray(files) ? files[0] : files
  if (!f) return
  const v = { _id: String(f._id), url: f.url, originalName: f.originalName }
  if (mediaPickerKind.value === 'poster') basicForm.posterFileId = v
  else basicForm.videoFileId = v
}

/* ─────────────────────────────────────────────────────────
  6. 误操删除
───────────────────────────────────────────────────────── */
async function onRemoveConfirm({ password }) {
  try {
    await subjectApi.remove(subject._id, { password })
    ElMessage.success('已删除')
    router.push('/subjects')
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', `学科 ${subject.name}`)
  }
}

onMounted(() => {
  // 详情 API 已 watch 即时调用一次; 仅保证顶层 loading 翻牌
})
</script>

<style scoped>
.page {
  max-width: 100%;
}
.page-header {
  margin-bottom: 16px;
}
.page-header__title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.block {
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.muted {
  color: #c0c4cc;
}
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
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
.materials {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 480px;  /* 2026-07-28: 加富文本后需要更高滚动区,容纳 el-tabs + textarea */
  overflow-y: auto;
}
/* 2026-07-28: 富文本编辑器 (弹窗内) */
.material-add-tabs { margin-top: 4px; }
.material-add-tabs :deep(.el-tabs__header) { margin-bottom: 6px; }
.material-add-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; }
.html-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
}
.html-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.html-editor-toolbar :deep(.el-button-group) { display: inline-flex; }
/* 富文本预览 (列表 chip → 弹窗) */
.html-preview-body {
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  max-height: 65vh;
  overflow-y: auto;
  line-height: 1.6;
  color: #303133;
}
.html-preview-body :deep(h1),
.html-preview-body :deep(h2),
.html-preview-body :deep(h3) { margin: 12px 0 6px; }
.html-preview-body :deep(p) { margin: 6px 0; }
.html-preview-body :deep(ul),
.html-preview-body :deep(ol) { padding-left: 24px; margin: 6px 0; }
.html-preview-body :deep(a) { color: #409eff; }
.html-preview-body :deep(img) { max-width: 100%; height: auto; }
.text-12 {
  font-size: 12px;
  color: #606266;
}
.desc-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.empty-wrap {
  margin-top: 40px;
}
.clickable-name {
  cursor: pointer;
  color: #409eff;
}
.clickable-name:hover {
  text-decoration: underline;
}
.preview-frame-wrap {
  width: 100%;
  height: 70vh;
  min-height: 480px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #f5f7fa;
  overflow: hidden;
}
.preview-frame {
  width: 100%;
  height: 100%;
  display: block;
}
.preview-missing {
  padding: 60px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}
</style>
