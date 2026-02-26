# Frontend 模块规则清单

## RULE-Frontend-001: 以 shared 类型为协议边界

前端不得在运行时假设后端 payload 的隐含字段；所有字段都应该在 `shared/index.ts` 定义。

## RULE-Frontend-002: streaming 更新必须可重入

WebSocket 消息可能乱序/重复/延迟。对 streaming 消息的更新逻辑应尽量幂等，避免依赖“只会来一次”。

## RULE-Frontend-003: 不阻塞 UI 线程

不要在渲染路径做重计算/大对象 stringify。该原型已经有较多 console.log，若要增强性能可逐步减少日志。
