cdef class Dataset:
    cdef int[5] shape
    cdef int item_size
    cdef int t_idx
    cdef int p_idx
    cdef int v_idx
    cdef int l_idx

    cdef object fd
    cdef object mm

    cdef double _read_var(self, int, int, int, int, int)
    cpdef public object get_wind(self, double, double, double, double,
                                   object)
