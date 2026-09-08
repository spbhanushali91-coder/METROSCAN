const currentUser = getUser();
if (currentUser) {
  document.getElementById('userInfo').textContent = `${currentUser.displayName} (${currentUser.role})`;
}