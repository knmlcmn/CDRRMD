const express = require('express');
const auth = require('../middleware/auth');
const {
  listAdmins,
  listArchivedAdmins,
  listArchivedUsers,
  listUsers,
  createAdmin,
  createUser,
  updateAdmin,
  deleteAdmin,
  restoreAdmin,
  permanentlyDeleteAdmin,
  updateUser,
  deleteUser,
  restoreUser,
  permanentlyDeleteUser,
} = require('../controllers/adminController');

const router = express.Router();

// Admin account management endpoints (all require auth).
router.get('/', auth, listAdmins);
router.get('/archived', auth, listArchivedAdmins);
router.get('/users/archived', auth, listArchivedUsers);
router.get('/users', auth, listUsers);
router.post('/users', auth, createUser);
router.put('/users/:id', auth, updateUser);
router.patch('/users/:id/restore', auth, restoreUser);
router.delete('/users/:id/permanent', auth, permanentlyDeleteUser);
router.delete('/users/:id', auth, deleteUser);
router.post('/', auth, createAdmin);
router.put('/:id', auth, updateAdmin);
router.delete('/:id', auth, deleteAdmin);
router.patch('/:id/restore', auth, restoreAdmin);
router.delete('/:id/permanent', auth, permanentlyDeleteAdmin);

module.exports = router;
