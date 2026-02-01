# 电子催费单

## 启动

```bash
npm install
npm run dev
```

`npm run dev` 会在启动前自动生成 `public/xlsx-index.json`，用于在前端选择最接近当前时间的 xlsx 文件。

## 使用说明

1. 把 `hotline.png` 放到 `public/` 目录。
2. 在 `/back` 页面使用“导入 xlsx”上传文件写入数据库。

## Supabase 表结构

在 Supabase SQL Editor 执行 `supabase.sql`，创建催费记录与处理记录表及策略。

- 表名：`billing_records` 导入的催费记录
- 表名：`processed_accounts` 已人工处理的户号，主页面将自动隐藏

## 路由

- `/` 催费工作台（列表/卡片模式）
- `/back` 后台手工标记
# Arrears
# Arrears
