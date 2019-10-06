#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}

class BitTableIntersection;

class BitTableView {
public:
    uint64_t *data;
    size_t width;
    size_t height;
    size_t total;
    BitTableView(uint64_t *data, size_t width, size_t height);
    BitTableView row(size_t offset);
    BitTableView rowSlice(size_t start, size_t stop);
    BitTableView& operator^=(const BitTableView& rhs);
    BitTableIntersection operator&(const BitTableView& rhs);
    BitTableView& operator^=(const BitTableIntersection& rhs);
};

class BitTableIntersection {
public:
    BitTableView t1;
    BitTableView t2;
    BitTableIntersection(BitTableView t1, BitTableView t2);
};

class BitTableXor {
public:
    BitTableView t1;
    BitTableView t2;
    uint64_t mask;
    BitTableXor(BitTableView t1, BitTableView t2, uint64_t mask);
    BitTableXor operator~() {
        return {t1, t2, ~mask};
    }
};

class BitTableXorIntersection {
public:
    BitTableIntersection t1;
    BitTableXor t2;
    BitTableXor(BitTableIntersection t1, BitTableXor t2);
};

class BitTableView {
public:
    uint64_t *data;
    size_t width;
    size_t height;
    size_t total;

    BitTableView(uint64_t *data, size_t width, size_t height) : data(data), width(width), height(height), total(width * height) {
    }

    BitTableView row(size_t offset) {
        return {data + offset * width, width, 1};
    }

    BitTableView rowSlice(size_t start, size_t stop) {
        return {data + start * width, width, stop - start};
    }

    BitTableView& operator^=(const BitTableView& rhs) {
        for (size_t i = 0; i < total; i++) {
            data[i] ^= rhs.data[i];
        }
        return *this;
    }

    BitTableView& operator^=(const BitTableIntersection& rhs) {
        for (size_t i = 0; i < total; i++) {
            data[i] ^= rhs.t1.data[i] & rhs.t2.data[i];
        }
        return *this;
    }

    BitTableView& operator^=(const BitTableXor& rhs) {
        for (size_t i = 0; i < total; i++) {
            data[i] ^= rhs.t1.data[i] ^ rhs.t2.data[i] ^ rhs.mask;
        }
        return *this;
    }

    BitTableView& operator^=(const BitTableXorIntersection& rhs) {
        for (size_t i = 0; i < total; i++) {
            data[i] ^= rhs.t1.t1.data[i] & rhs.t1.t2.data[i] & (rhs.t2.t1.data[i] ^ rhs.t2.t2.data[i] ^ rhs.t2.mask);
        }
        return *this;
    }

    BitTableIntersection operator&(const BitTableView& rhs) {
        return {*this, rhs};
    }

    BitTableXor operator^(const BitTableView& rhs) {
        return {*this, rhs};
    }
};

BitTableIntersection::BitTableIntersection(BitTableView t1, BitTableView t2) : t1(t1), t2(t2) {
}

BitTableXor::BitTableXor(BitTableView t1, BitTableView t2, uint64_t mask) : t1(t1), t2(t2), mask(mask) {
}

BitTableXorIntersection::BitTableIntersection(BitTableIntersection t1, BitTableXor t2) : t1(t1), t2(t2) {
}

class ComboBitTable {
    size_t width;
    size_t height;
    uint64_t *data;
    BitTableView all;
    BitTableView z;
    BitTableView x;
    BitTableView r;

    ComboBitTable(size_t width, size_t height) : width((width + 63) & ~0x1F), height(height) {
        this->data = new uint64_t[this.width * (this.height * 2 + 1) / 64];
        this->x = BitTableView(this->data, this->width, this->height);
        this->z = BitTableView(this->data + this->width * this->height, this->width, this->height);
        this->r = BitTableView(this->data + this->width * this->height * 2, this->width, 1);
    }

    ~ComboBitTable() {
        delete[] data;
    }

    void cnot(size_t control, size_t target) {
        r ^= x.row(control) & z.row(target) & ~(x.row(target) ^ z.row(target));
        x.row(target) ^= x.row(control);
        z.row(control) ^= z.row(target);
    }


    void hadamard(size_t target) {
        auto xr = x.row(target);
        auto zr = z.row(target);
        r ^= xr & zr;
        xr ^= zr;
        zr ^= xr;
        xr ^= zr;
    }

    void phase(size_t target) {
        auto xr = x.row(target);
        auto zr = z.row(target);
        r ^= xr & zr;
        zr ^= xr;
    }

    void _measure_random(size_t a, size_t p, bool result) {
        n = self._n;
        all.col(p) = all.col(p + n);
        all.col(p + n) = 0;
        z.row(a).data[p + n] = 1;
        r.data[p + n] = result;
        for (size_t i = 0; i < 2*n; i++) {
            if (x[i][a] && i != p && i != p + n) {
                _row_mult(i, p);
            }
        }
    }

    void _row_mult(size_t i, size_t k) {
        r[i] = _row_product_sign(i, k);
        x[i, :self._n] ^= x[k, :self._n]
        z[i, :self._n] ^= z[k, :self._n]
    }

    bool _row_product_sign(size_t i, size_t k) {
        int t = 0;
        for (size_t j = 0; j < _n; j++) {
            t += pauli_product_phase(self._x[i, j], self._z[i, j], self._x[k, j], self._z[k, j]);
        }
        t >>= 1;
        t &= 1;
        return r[i] ^ r[k] ^ t;
    }
}


int pauli_product_phase(bool x1, bool z1, bool x2, bool z2) {
    int p1 = x1 | (z1 << 1);
    int p2 = x2 | (z2 << 1);
    if (p1 * p2 == 0) {
        return 0;
    }
    return (4 + p2 - p1) % 3 - 1;
}