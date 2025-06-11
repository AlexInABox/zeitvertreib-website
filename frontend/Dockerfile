FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

RUN npm install -g @angular/cli

COPY . .

RUN npm run build

FROM nginx:alpine

COPY --from=build app/dist/zeitvertreib-website/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]