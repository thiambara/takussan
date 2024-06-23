## TAKUSSAN

### GETTING START

### 1. **Configure the app through .env file**

### 2. **Install app dependencies**
> $ composer install

### 3. **Dump autoload files**
> $ composer dump-autoload

### 4. **Create a .env file and copy in the content of the .env.example file**
### 5. **Configure you database and update DB_... variables in the .env file**

### 6. **Execute migrations**
> $ php artisan migrate

### 7. **Start the server**
> $ php artisan serve

### 8. **Start jobs service worker**
> $ php artisan queue:work --queue=high,default

### 9. **To generate IDE HELPERS**
> $ php artisan ide-helper:models --dir='app' -M

