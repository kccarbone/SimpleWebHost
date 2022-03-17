FROM node:17.7-bullseye

EXPOSE 80

RUN mkdir -p /home/node/app
WORKDIR /home/node/app
COPY . .
RUN npm install

RUN mkdir -p /home/node/app/config
VOLUME /home/node/app/config

CMD ["npm", "start"]
STOPSIGNAL SIGINT