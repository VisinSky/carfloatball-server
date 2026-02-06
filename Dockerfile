FROM node:18-alpine

WORKDIR /app

# 只复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm install --omit=dev

# 复制服务端代码和管理界面
COPY server.js ./
COPY public ./public/

# 创建数据目录
RUN mkdir -p uploads

# 数据持久化挂载点
VOLUME ["/app/db.json", "/app/uploads"]

EXPOSE 3000

CMD ["node", "server.js"]
