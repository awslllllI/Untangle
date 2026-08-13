# 技术栈采用 TypeScript + Canvas，不用 Flutter

在「只做 Toy/Web 静态页 + 自写解缠内核」的前提下，曾考虑坚持 Flutter Web 以便日后扩端。解缠是 2D 顶点/线段与交叉检测，Flutter Web 包体与嵌入页风险更大，且三端收益已被 ADR-0001 砍掉。决定：**用 TypeScript + Canvas 2D 实现**；内核与渲染/输入解耦，不引入重型游戏引擎，除非日后出现明确缺口。
