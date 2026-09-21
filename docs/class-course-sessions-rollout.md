# 既卒授業回数・割当・実施（067–068）ロールアウト

本番 DB に対してこのドキュメントから SQL を自動実行しないこと。

| 用途 | パス |
|------|------|
| migration | `supabase/migrations/067_class_course_sessions.sql` |
| precheck | `supabase/queries/067_class_course_sessions_precheck.sql` |
| verify | `supabase/queries/067_class_course_sessions_verify.sql` |
| migration | `supabase/migrations/068_class_course_cancel_guards.sql` |
| precheck | `supabase/queries/068_class_course_cancel_guards_precheck.sql` |
| verify | `supabase/queries/068_class_course_cancel_guards_verify.sql` |

## 適用順

1. 064〜066 および class_schedule（053–058）が適用済みであることを確認
2. **067 precheck**（read-only）→ 依存 `PASS`、067 オブジェクト `ABSENT`
3. **067 適用**
4. **067 verify**（全行 `PASS`）
5. **068 precheck** → 067 依存 `PASS`、068 RPC は適用前 `ABSENT`
6. **068 適用**（割当取消・対象外し RPC、対象 DELETE ガード、再追加の二重防止）
7. **068 verify**（全行 `PASS`）
8. **新アプリをデプロイ**（回数登録・対象コマ・実施 UI・通知聴衆・取消ガード）
9. 大管理者でスモーク後、必要なら短時間フリーズを解除

## 旧アプリ互換

- 既存コマは `course_unit_id` NULL・`audience_type=all_kisotsu` のまま（非破壊）
- 旧アプリは新テーブルを知らない。067 適用後も既存予定の閲覧は可能だが、回数・実施・対象強調は新アプリが必要
- service_role を使う旧経路では新 RPC を呼ばない限り回数データは増えない
- カットオーバー中は大管理者の授業予定・回数登録操作を短時間控えることを推奨

## 通常管理者

- 新テーブルは RLS 上 super-admin のみ（生徒は自分の割当／自分の対象行のみ SELECT）
- UI・API でも大管理者ゲートを維持し、通常管理者に既卒の存在・件数を漏らさない

## Rollback

- 通常手順に破壊的 DROP を置かない（実施履歴・割当の喪失を避ける）
- 問題時は **アプリを戻し、067 スキーマは残置** を優先
- どうしても撤去する場合は別途バックアップ後に限定作業（本ドキュメントでは手順化しない）

## 通知

- 回数追加・割当・実施記録では通知しない
- 予定の create/change/cancel は既存カテゴリを維持し、聴衆のみ影響生徒に限定
  - 日全体の会場変更・中止: その日の全コマ対象を集約（全員向けコマがあれば既卒全員）
  - 個別コマの変更・中止: そのコマの対象者のみ（同日の無関係な全員向けコマへ広げない）
  - 対象者変更: 変更前後の和（外れた生徒・追加された生徒を含む）
- 068: 割当取消・対象外しは RPC/トリガで実施・欠席記録がある場合に拒否。再追加は cancelled 行の再活性化で二重 active を防ぐ
