# TabBar 图标占位

> uni-app 的 `tabBar.iconPath` 是**必须**存在的图片资源（运行时不会自动生成）。
>
> 占位 PNG 在仓库中通常不会 commit，由设计师或自动生成脚本产出后放回本目录。
>
> 需要的图片：
>  - `home.png` / `home-active.png`
>  - `pet.png` / `pet-active.png`
>  - `share.png` / `share-active.png`
>  - `me.png` / `me-active.png`
>
> 建议尺寸 81×81 像素（3x 设计稿），透明背景 PNG，颜色可调。
>
> 没有图标时 uni-app 启动会**报错**，所以这里用 .gitkeep 兜底，启动前请先准备图片。
